package com.example.gurumi

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.util.UUID

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var rotationSensor: Sensor? = null
    private var accelSensor: Sensor? = null

    private lateinit var tvStatus: TextView
    private lateinit var tvPitch: TextView
    private lateinit var btnForward: Button
    private lateinit var btnBackward: Button
    private lateinit var btnConnect: Button

    private var isForwardPressed = false
    private var isBackwardPressed = false
    private var currentSteer = "S"
    private var lastCommand = ""

    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var isConnected = false

    private val serviceUuid: UUID = UUID.fromString("4fafc201-1fb5-459e-8fcc-c5c9c331914b")
    private val characteristicUuid: UUID = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8")

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvPitch = findViewById(R.id.tvPitch)
        btnForward = findViewById(R.id.btnForward)
        btnBackward = findViewById(R.id.btnBackward)
        btnConnect = findViewById(R.id.btnConnect)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        if (rotationSensor == null) {
            // SM-G600S 등 Rotation Vector 센서가 없는 보급형/구형 스마트폰용 가속도 센서 폴백
            accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        }

        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter

        btnConnect.setOnClickListener {
            checkAndRequestPermissions()
        }

        btnForward.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> isForwardPressed = true
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_OUTSIDE -> {
                    isForwardPressed = false
                    view.performClick()
                }
            }
            updateCommand()
            true
        }

        btnBackward.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> isBackwardPressed = true
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_OUTSIDE -> {
                    isBackwardPressed = false
                    view.performClick()
                }
            }
            updateCommand()
            true
        }
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.BLUETOOTH_SCAN)
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 100)
        } else {
            startBleScan()
        }
    }

    // 안드로이드 5.1.1(API 22) 맞춤형 BLE 스캔
    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    private fun startBleScan() {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            Toast.makeText(this, "스마트폰의 블루투스를 켜주세요.", Toast.LENGTH_SHORT).show()
            return
        }

        tvStatus.text = "상태: Gurumi 검색 중..."
        var deviceFound = false

        val leScanCallback = BluetoothAdapter.LeScanCallback { device, rssi, scanRecord ->
            val deviceName = device.name
            if (!deviceFound && deviceName != null && deviceName.contains("Gurumi", ignoreCase = true)) {
                deviceFound = true

                // 스캔을 먼저 완전히 정지시킨 후 0.5초 여유를 두고 연결 시도 (안드로이드 5.1.1 필수)
                adapter.stopLeScan(null)

                runOnUiThread {
                    tvStatus.text = "상태: Gurumi 발견! 소켓 연결 중..."
                }

                Handler(Looper.getMainLooper()).postDelayed({
                    connectToBleDevice(device)
                }, 500)
            }
        }

        adapter.startLeScan(leScanCallback)

        Handler(Looper.getMainLooper()).postDelayed({
            adapter.stopLeScan(leScanCallback)
            if (!isConnected && !deviceFound) {
                tvStatus.text = "상태: Gurumi를 찾지 못함 (재시도 필요)"
            }
        }, 8000)
    }

    // 안드로이드 5.1.1 전용 소켓 커넥트 로직
    @SuppressLint("MissingPermission")
    private fun connectToBleDevice(device: BluetoothDevice) {
        // 기존 Gatt 자원 정리
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null

        val gattCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    runOnUiThread {
                        tvStatus.text = "상태: 물리 연결 성공! 서비스 탐색 중..."
                    }

                    // 안드로이드 5.1.1 소켓안정을 위해 1.2초 대기 후 서비스 탐색
                    Handler(Looper.getMainLooper()).postDelayed({
                        gatt?.discoverServices()
                    }, 1200)

                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    isConnected = false
                    runOnUiThread {
                        tvStatus.text = "상태: 연결 끊김 (다시 찾기 클릭)"
                    }
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    val service = gatt?.getService(serviceUuid)
                    rxCharacteristic = service?.getCharacteristic(characteristicUuid)

                    if (rxCharacteristic != null) {
                        isConnected = true
                        runOnUiThread {
                            tvStatus.text = "상태: Gurumi 연결 성공!"
                            Toast.makeText(this@MainActivity, "구루미 연결 성공!", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        runOnUiThread {
                            tvStatus.text = "상태: 서비스 탐색 실패"
                        }
                    }
                }
            }
        }

        // 노트3 네오(API 22) 버그 방지: autoConnect를 true로 시도하거나 레가시 방식으로 호출
        bluetoothGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
            // 안드로이드 5.1.1 전용: autoConnect = false
            device.connectGatt(this, false, gattCallback)
        }
    }

    override fun onResume() {
        super.onResume()
        if (rotationSensor != null) {
            sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI)
        } else if (accelSensor != null) {
            sensorManager.registerListener(this, accelSensor, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    @SuppressLint("MissingPermission")
    override fun onDestroy() {
        super.onDestroy()
        bluetoothGatt?.close()
    }

    private var lastSendTime = 0L
    private val sendIntervalMs = 80L // BLE 기울기 변경 패킷 전송 최소 간격 (ms)
    private var lastDriveCmd = "S"

    private val mainHandler = Handler(Looper.getMainLooper())
    private var stopRunnable1: Runnable? = null
    private var stopRunnable2: Runnable? = null

    private var currentRollDegree = 0

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return

        val rollDegree: Int = when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                val rotationMatrix = FloatArray(9)
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)

                val adjustedMatrix = FloatArray(9)
                SensorManager.remapCoordinateSystem(
                    rotationMatrix,
                    SensorManager.AXIS_Y,
                    SensorManager.AXIS_MINUS_X,
                    adjustedMatrix
                )

                val orientation = FloatArray(3)
                SensorManager.getOrientation(adjustedMatrix, orientation)

                Math.toDegrees(orientation[2].toDouble()).toInt()
            }
            Sensor.TYPE_ACCELEROMETER -> {
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]

                // Rotation Vector 센서가 없는 보급형/구형 기종(SM-G600S) 가속도 센서 기반 가로 모드 좌우 기울기 계산
                Math.toDegrees(Math.atan2(-ay.toDouble(), Math.sqrt((ax * ax + az * az).toDouble()))).toInt()
            }
            else -> return
        }

        // -90도 ~ +90도 범위로 클램핑 (Clamping)
        currentRollDegree = rollDegree.coerceIn(-90, 90)

        currentSteer = when {
            currentRollDegree < -15 -> "L"
            currentRollDegree > 15 -> "R"
            else -> "S"
        }

        val textToDisplay = "좌우 기울기: ${currentRollDegree}° ($currentSteer)"
        tvPitch.text = textToDisplay
        updateCommand()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun cancelStopRunnables() {
        stopRunnable1?.let { mainHandler.removeCallbacks(it) }
        stopRunnable2?.let { mainHandler.removeCallbacks(it) }
        stopRunnable1 = null
        stopRunnable2 = null
    }

    private fun updateCommand() {
        val driveCmd = when {
            isForwardPressed -> "F"
            isBackwardPressed -> "B"
            else -> "S"
        }

        // 1. 전진/후진 버튼을 누르지 않은 상태 (driveCmd == "S")
        if (driveCmd == "S") {
            val stopCommand = "S,0"
            
            // 버튼을 누르고 있다가 '방금 막 손을 뗀 순간'에만 정지 명령("S,0")을 전송함
            if (lastDriveCmd != "S") {
                lastCommand = stopCommand
                lastDriveCmd = "S"
                lastSendTime = System.currentTimeMillis()

                // 정지 패킷 즉시 전송
                sendBleData(stopCommand)

                // BLE Stack Busy 대비 30ms, 80ms 후 확정 재전송
                cancelStopRunnables()

                stopRunnable1 = Runnable {
                    if (!isForwardPressed && !isBackwardPressed) {
                        sendBleData(stopCommand)
                    }
                }
                stopRunnable2 = Runnable {
                    if (!isForwardPressed && !isBackwardPressed) {
                        sendBleData(stopCommand)
                    }
                }

                mainHandler.postDelayed(stopRunnable1!!, 30)
                mainHandler.postDelayed(stopRunnable2!!, 80)
            }
            
            // 버튼을 안 누르고 있는 평소 상태에서는 폰을 기울여도 BLE 데이터를 전송하지 않음 (Idle)
            return
        }

        // 2. 전진("F") 또는 후진("B") 버튼을 누르고 있는 상태
        cancelStopRunnables()

        // 정밀 비례 조향 제어를 위해 기울기 각도(-90 ~ +90)를 포맷팅하여 전송 (예: "F,-45", "F,90")
        val finalCommand = "$driveCmd,$currentRollDegree"
        val currentTime = System.currentTimeMillis()
        val isDriveStateChanged = (driveCmd != lastDriveCmd)

        // 버튼을 막 누른 순간이거나, 누르고 있는 동안 기울기 각도가 변경된 경우 BLE 전송
        if (isDriveStateChanged || finalCommand != lastCommand) {
            if (isDriveStateChanged || (currentTime - lastSendTime >= sendIntervalMs)) {
                lastCommand = finalCommand
                lastDriveCmd = driveCmd
                lastSendTime = currentTime
                sendBleData(finalCommand)
            }
        }
    }

    private var pendingBleData: String? = null
    private val bleRetryHandler = Handler(Looper.getMainLooper())
    private val bleRetryRunnable = object : Runnable {
        override fun run() {
            pendingBleData?.let { data ->
                if (executeWriteBle(data)) {
                    pendingBleData = null
                } else {
                    // BLE HW 스택이 바빠서 전송에 실패한 경우 15ms 후 성공할 때까지 무조건 재시도
                    bleRetryHandler.postDelayed(this, 15)
                }
            }
        }
    }

    private fun sendBleData(data: String) {
        pendingBleData = data
        bleRetryHandler.removeCallbacks(bleRetryRunnable)

        if (!executeWriteBle(data)) {
            // BLE 쓰기가 거부(false)된 경우 15ms 후 즉시 재시도 예약
            bleRetryHandler.postDelayed(bleRetryRunnable, 15)
        } else {
            pendingBleData = null
        }
    }

    @SuppressLint("MissingPermission")
    private fun executeWriteBle(data: String): Boolean {
        val gatt = bluetoothGatt ?: return false
        val char = rxCharacteristic ?: return false
        if (!isConnected) return false

        val bytes = data.toByteArray()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val result = gatt.writeCharacteristic(char, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
            result == android.bluetooth.BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            char.value = bytes
            @Suppress("DEPRECATION")
            gatt.writeCharacteristic(char)
        }
    }
}