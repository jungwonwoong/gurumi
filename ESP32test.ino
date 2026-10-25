#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define OLED_SDA 5
#define OLED_SCL 6
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDRESS 0x3C

#define MOTOR_A1 1
#define MOTOR_A2 2
#define MOTOR_B1 3
#define MOTOR_B2 4

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_MPU6050 mpu;

float pitchDeg = 0, rollDeg = 0, accelMagnitude = 9.81;
bool mpuReady = false, shockDetected = false;
unsigned long shockUntil = 0, lastShockTime = 0, lastFrame = 0, nextBlink = 0, blinkStart = 0;
bool blinking = false;
int pupilX = 0, pupilY = 0;

const float SHOCK_THRESHOLD = 5.0;
const unsigned long SHOCK_DURATION = 900;
const unsigned long SHOCK_COOLDOWN = 1200;

struct CommandPacket {
  char cmd[16];
};

QueueHandle_t commandQueue = nullptr;
bool deviceConnected = false;

#define USER_LED 21

const unsigned long LED_DISCONNECTED_INTERVAL = 500;
const unsigned long LED_CONNECTED_INTERVAL = 300;

unsigned long lastLedToggle = 0;
bool userLedState = false;


void updateUserLed() {
  if (deviceConnected) {
    // 스마트폰 연결 성공: LED 계속 켜기
    digitalWrite(USER_LED, LOW);
    userLedState = true;
    return;
  }

  // 연결되지 않은 상태: 0.5초 간격으로 점멸
  unsigned long now = millis();

  if (now - lastLedToggle >= 500) {
    lastLedToggle = now;
    userLedState = !userLedState;

    digitalWrite(USER_LED, userLedState ? LOW : HIGH);
  }
}


// -------------------- BLE 서버 연결 감지 및 시리얼 출력 --------------------
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("\n=================================");
      Serial.println("[BLE] 스마트폰 물리 연결 성공! (Connected)");
      Serial.println("=================================");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("\n[BLE] 스마트폰 연결 끊어짐! (Disconnected)");
      Serial.println("[BLE] 재접속을 위해 BLE Advertising 재개합니다...\n");
      delay(300);
      pServer->startAdvertising(); // 끊어지면 즉시 재광고
    }
};

// -------------------- BLE 데이터 수신 시 시리얼 출력 --------------------
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) override {
    String value = pCharacteristic->getValue();

    if (value.length() == 0) return;

    value.trim();

    CommandPacket packet = {};
    value.toCharArray(packet.cmd, sizeof(packet.cmd));

    if (commandQueue != nullptr) {
      // ★ 핵심 해결: 큐가 가득 차면 가장 오래된 옛날 패킷을 1개 버리고, 최신 패킷(정지 신호 등)을 100% 확실히 저장!
      if (uxQueueSpacesAvailable(commandQueue) == 0) {
        CommandPacket dummy;
        xQueueReceive(commandQueue, &dummy, 0); // 옛날 명령 버림
      }
      xQueueSend(commandQueue, &packet, 0); // 최신 명령(정지 신호 등) 무조건 저장
    }
  }
};

// -------------------- 모터 제어 보조 함수 --------------------
void setMotorA(int speed) { // speed: -255 ~ +255 (음수는 역회전)
  if (speed > 0) {
    analogWrite(MOTOR_A1, 0);          // 방향 반전
    analogWrite(MOTOR_A2, speed);      // 방향 반전
  } else if (speed < 0) {
    analogWrite(MOTOR_A1, -speed);     // 방향 반전
    analogWrite(MOTOR_A2, 0);          // 방향 반전
  } else {
    analogWrite(MOTOR_A1, 0);
    analogWrite(MOTOR_A2, 0);
  }
}

void setMotorB(int speed) { // speed: -255 ~ +255
  if (speed > 0) {
    analogWrite(MOTOR_B1, speed);
    analogWrite(MOTOR_B2, 0);
  } else if (speed < 0) {
    analogWrite(MOTOR_B1, 0);
    analogWrite(MOTOR_B2, -speed);
  } else {
    analogWrite(MOTOR_B1, 0);
    analogWrite(MOTOR_B2, 0);
  }
}

// -------------------- BLE 커맨드 수신 및 모터 비례 제어 --------------------
// 수신 명령어 예시: "F,-45", "F,90", "S,0"
void controlMotors(String cmd) {
  cmd.trim();
  int commaIdx = cmd.indexOf(',');
  if (commaIdx == -1) return;

  char drive = cmd.charAt(0);
  int steer = cmd.substring(commaIdx + 1).toInt(); // -90 ~ +90

  // 1. 손을 뗀 정지 상태
  if (drive == 'S') {
    setMotorA(0);
    setMotorB(0);
    return;
  }

  int baseSpeed = 255; // 최대 속도 (0~255)
  int absSteer = abs(steer);
  if (absSteer > 90) absSteer = 90;

  int innerSpeed = baseSpeed;

  // 2. 기울기 각도에 따른 안쪽 바퀴 속도 계산
  if (absSteer <= 15) {
    innerSpeed = baseSpeed; // 직진 (100%)
  } else if (absSteer <= 45) {
    // 15도 ~ 45도: 100% -> 0% (완전 정지)
    float ratio = 1.0 - ((float)(absSteer - 15) / 30.0);
    innerSpeed = (int)(baseSpeed * ratio);
  } else {
    // 45도 ~ 90도: 0% -> -100% (역방향 회전)
    float ratio = (float)(absSteer - 45) / 45.0;
    innerSpeed = -(int)(baseSpeed * ratio);
  }

  int speedA = baseSpeed; // 왼쪽 모터
  int speedB = baseSpeed; // 오른쪽 모터

  // 3. 기울임 방향에 따른 좌/우 모터 배치
  if (steer < 0) {
    // 왼쪽 기울임: 왼쪽(A) = 안쪽 바퀴, 오른쪽(B) = 바깥쪽 바퀴(100%)
    speedA = innerSpeed;
    speedB = baseSpeed;
  } else if (steer > 0) {
    // 오른쪽 기울임: 오른쪽(B) = 안쪽 바퀴, 왼쪽(A) = 바깥쪽 바퀴(100%)
    speedA = baseSpeed;
    speedB = innerSpeed;
  }

  // 4. 후진 모드일 경우 전체 모터 방향 반전
  if (drive == 'B') {
    speedA = -speedA;
    speedB = -speedB;
  }

  // 5. 모터 제어 출력
  setMotorA(speedA);
  setMotorB(speedB);
}

void drawEye(int cx, int cy, int eyeW, int eyeH, int px, int py, bool closed) {
  if (closed) {
    display.drawLine(cx - eyeW / 2, cy, cx + eyeW / 2, cy, SSD1306_WHITE);
    display.drawLine(cx - eyeW / 2 + 3, cy + 2, cx + eyeW / 2 - 3, cy + 2, SSD1306_WHITE);
    return;
  }
  display.fillRoundRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH, 8, SSD1306_WHITE);
  display.fillCircle(cx + px, cy + py, 7, SSD1306_BLACK);
  display.fillCircle(cx + px - 2, cy + py - 2, 2, SSD1306_WHITE);
}

void readMPU6050() {
  if (!mpuReady) return;
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);

  float ax = accel.acceleration.x, ay = accel.acceleration.y, az = accel.acceleration.z;
  rollDeg = atan2(ay, az) * 180.0 / PI;
  pitchDeg = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
  accelMagnitude = sqrt(ax * ax + ay * ay + az * az);

  unsigned long now = millis();
  if (fabs(accelMagnitude - 9.81) > SHOCK_THRESHOLD && now - lastShockTime > SHOCK_COOLDOWN) {
    shockDetected = true;
    shockUntil = now + SHOCK_DURATION;
    lastShockTime = now;
  }
  if (shockDetected && now >= shockUntil) {
    shockDetected = false;
  }
}

void drawFace() {
  unsigned long now = millis();
  display.clearDisplay();

  if (shockDetected) {
    drawEye(37, 27, 38, 38, 0, 0, false);
    drawEye(91, 27, 38, 38, 0, 0, false);
    display.drawCircle(64, 53, 5, SSD1306_WHITE);
    display.drawChar(112, 0, '!', SSD1306_WHITE, SSD1306_BLACK, 1);
    display.display();
    return;
  }

  bool tilted = fabs(pitchDeg) > 15 || fabs(rollDeg) > 15;

  if (!blinking && now >= nextBlink) {
    blinking = true;
    blinkStart = now;
  }
  if (blinking && now - blinkStart >= 150) {
    blinking = false;
    nextBlink = now + random(2500, 5000);
  }

  pupilX = constrain((int)(rollDeg / 45.0 * 5.0), -5, 5);
  pupilY = constrain((int)(pitchDeg / 45.0 * 5.0), -5, 5);

  if (tilted) {
    drawEye(37, 29, 30, 27, pupilX, pupilY, blinking);
    drawEye(91, 29, 30, 27, pupilX, pupilY, blinking);
    display.drawLine(57, 55, 64, 51, SSD1306_WHITE);
    display.drawLine(64, 51, 71, 55, SSD1306_WHITE);
  } else {
    drawEye(37, 29, 34, 34, pupilX, pupilY, blinking);
    drawEye(91, 29, 34, 34, pupilX, pupilY, blinking);
    if (!blinking) {
      display.drawLine(57, 52, 64, 56, SSD1306_WHITE);
      display.drawLine(64, 56, 71, 52, SSD1306_WHITE);
    }
  }
  display.display();
}

void setup() {
  Serial.begin(115200);
commandQueue = xQueueCreate(10, sizeof(CommandPacket));

if (commandQueue == nullptr) {
  Serial.println("[오류] BLE 명령 큐 생성 실패");
}
  pinMode(MOTOR_A1, OUTPUT); pinMode(MOTOR_A2, OUTPUT);
  pinMode(MOTOR_B1, OUTPUT); pinMode(MOTOR_B2, OUTPUT);


pinMode(USER_LED, OUTPUT);
digitalWrite(USER_LED, HIGH);  // LED 끄기

// 1. BLE 초기화
  BLEDevice::init("Gurumi");
  
  // 안드로이드 5.1.1 BLE 패킷 튕김 방지를 위해 MTU 크기를 구형 표준(23)으로 고정
  BLEDevice::setMTU(23);

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  // 안드로이드 5.1.1 호환을 위해 WRITE 속성만 부여 (WRITE_NR 제외)
  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                         CHARACTERISTIC_UUID,
                                         BLECharacteristic::PROPERTY_READ |
                                         BLECharacteristic::PROPERTY_WRITE
                                       );

  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  // 구형 안드로이드 전용 Advertising 파라미터 (연결 타임아웃 방지)
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false); // ScanResponse를 끌 때 구형 기기 스캔 성공률이 비약적으로 올라갑니다.
  pAdvertising->setMinInterval(0x020);  // 20ms
  pAdvertising->setMaxInterval(0x040);  // 40ms
  pAdvertising->start();

  Serial.println("\n[시스템] 안드로이드 5.1.1 맞춤형 BLE 'Gurumi' 가 준비되었습니다!");

  Wire.begin(OLED_SDA, OLED_SCL);
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(18, 25);
    display.println("GURUMI START");
    display.display();
    delay(800);
  }

  if (mpu.begin(0x68, &Wire)) {
    mpuReady = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  randomSeed(micros());
  nextBlink = millis() + 2000;
}

void loop() {
  unsigned long now = millis();

updateUserLed();

CommandPacket packet;

while (commandQueue != nullptr &&
       xQueueReceive(commandQueue, &packet, 0) == pdTRUE) {
  controlMotors(String(packet.cmd));
}

  static unsigned long lastSensorRead = 0;
  if (now - lastSensorRead >= 10) {
    lastSensorRead = now;
    readMPU6050();
  }

  if (now - lastFrame >= 40) {
    lastFrame = now;
    drawFace();
  }
}