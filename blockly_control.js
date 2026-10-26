// === 1. Blockly 한국어 메시지 기본 정의 ===
Blockly.Msg = Blockly.Msg || {};
Blockly.Msg["LOGIC_HUE"] = "210";
Blockly.Msg["LOOPS_HUE"] = "120";
Blockly.Msg["MATH_HUE"] = "230";
Blockly.Msg["TEXTS_HUE"] = "160";
Blockly.Msg["VARIABLES_HUE"] = "330";

Blockly.Msg["CONTROLS_IF_MSG_IF"] = "만약";
Blockly.Msg["CONTROLS_IF_MSG_THEN"] = "이면";
Blockly.Msg["CONTROLS_IF_MSG_ELSE"] = "아니면";
Blockly.Msg["CONTROLS_IF_MSG_ELSEIF"] = "그렇지 않고 만약";
Blockly.Msg["CONTROLS_REPEAT_TITLE"] = "%1 번 반복하기";
Blockly.Msg["CONTROLS_REPEAT_INPUT_DO"] = "실행";
Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_WHILE"] = "동안 반복";
Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_UNTIL"] = "까지 반복";
Blockly.Msg["CONTROLS_WHILEUNTIL_INPUT_DO"] = "실행";
Blockly.Msg["LOGIC_OPERATION_AND"] = "그리고";
Blockly.Msg["LOGIC_OPERATION_OR"] = "또는";
Blockly.Msg["LOGIC_BOOLEAN_TRUE"] = "참";
Blockly.Msg["LOGIC_BOOLEAN_FALSE"] = "거짓";
Blockly.Msg["LOGIC_NEGATE_TITLE"] = "%1 이(가) 아니다";

// === 2. gurumi 상태 제어용 전역 객체 ===
window.gurumi = {
    leftSpeed: 0,
    rightSpeed: 0,
    isBlockControlled: false,
    executionId: 0,
    setLeftWheel: function(speed) { this.leftSpeed = Number(speed); },
    setRightWheel: function(speed) { this.rightSpeed = Number(speed); },
    setBothWheels: function(left, right) {
        this.leftSpeed = Number(left);
        this.rightSpeed = Number(right);
    },
    stop: function() {
        this.leftSpeed = 0;
        this.rightSpeed = 0;
    },
    isExecutionActive: function(runId) {
        return this.isBlockControlled && this.executionId === runId;
    },
    yieldToSimulation: function() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    },
    waitSec: function(seconds, runId) {
        const ms = Math.max(0, Number(seconds) * 1000);
        return new Promise(resolve => {
            const start = performance.now();
            const check = () => {
                if (!this.isExecutionActive(runId)) {
                    resolve();
                    return;
                }
                if (performance.now() - start >= ms) {
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    },
    log: function(msg) {
        console.log('[gurumi 로그]:', msg);
        addConsoleLog(msg);
    }
};
// === 신호(Signal) 이벤트 관리 시스템 ===
window.gurumiSignalSystem = {
    listeners: {},
    
    // 신호 수신 등록
    register: function(signalName, callback) {
        if (!this.listeners[signalName]) {
            this.listeners[signalName] = [];
        }
        this.listeners[signalName].push(callback);
    },
    
    // 리스너 초기화 (실행 시작 시 호출)
    reset: function() {
        this.listeners = {};
    },
    
    // 신호 보내기 (비동기 처리)
    emit: function(signalName, runId, wait = false) {
        const targets = this.listeners[signalName] || [];
        const promises = targets.map(cb => cb(runId));
        if (wait) {
            return Promise.all(promises);
        }
        return Promise.resolve();
    }
};
// 화면 콘솔 로그 출력 함수
function addConsoleLog(text) {
    const logsContainer = document.getElementById('console-logs');
    if (!logsContainer) return;

    const entry = document.createElement('div');
    entry.className = 'console-entry';

    const now = new Date();
    const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = timeStr;

    const textSpan = document.createElement('span');
    textSpan.className = 'console-text';
    textSpan.textContent = String(text);

    entry.appendChild(timeSpan);
    entry.appendChild(textSpan);
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// === 3. Blockly 커스텀 블록 정의 & 코드 생성기 ===
Blockly.Blocks['when_run_button_clicked'] = {
    init: function() {
        this.appendDummyInput().appendField("▶ 블록 실행 버튼을 눌렀을 때");
        this.appendStatementInput("DO");
        this.setColour(20);
    }
};
javascript.javascriptGenerator.forBlock['when_run_button_clicked'] = function(block, generator) {
    return generator.statementToCode(block, 'DO');
};

Blockly.Blocks['set_left_wheel'] = {
    init: function() {
        this.appendValueInput("SPEED").setCheck("Number").appendField("왼쪽 바퀴 속도를");
        this.appendDummyInput().appendField("(으)로 정하기");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['set_left_wheel'] = function(block, generator) {
    var value = generator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '0';
    return `if (gurumi.isExecutionActive(runId)) gurumi.setLeftWheel(${value});\n`;
};

Blockly.Blocks['set_right_wheel'] = {
    init: function() {
        this.appendValueInput("SPEED").setCheck("Number").appendField("오른쪽 바퀴 속도를");
        this.appendDummyInput().appendField("(으)로 정하기");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['set_right_wheel'] = function(block, generator) {
    var value = generator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '0';
    return `if (gurumi.isExecutionActive(runId)) gurumi.setRightWheel(${value});\n`;
};

Blockly.Blocks['set_both_wheels'] = {
    init: function() {
        this.appendValueInput("LEFT_SPEED").setCheck("Number").appendField("양쪽 바퀴 속도 : 왼쪽");
        this.appendValueInput("RIGHT_SPEED").setCheck("Number").appendField("오른쪽");
        this.appendDummyInput().appendField("(으)로 정하기");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['set_both_wheels'] = function(block, generator) {
    var left = generator.valueToCode(block, 'LEFT_SPEED', javascript.Order.ATOMIC) || '0';
    var right = generator.valueToCode(block, 'RIGHT_SPEED', javascript.Order.ATOMIC) || '0';
    return `if (gurumi.isExecutionActive(runId)) gurumi.setBothWheels(${left}, ${right});\n`;
};

Blockly.Blocks['move_direction'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("gurumi")
            .appendField(new Blockly.FieldDropdown([
                ["전진", "FORWARD"],
                ["후진", "BACKWARD"],
                ["좌회전", "LEFT"],
                ["우회전", "RIGHT"]
            ]), "DIR");
        this.appendValueInput("SPEED").setCheck("Number").appendField("속도");
        this.appendDummyInput().appendField("(으)로 이동하기");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['move_direction'] = function(block, generator) {
    var dir = block.getFieldValue('DIR');
    var speed = generator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '7';
    let leftCode = '0', rightCode = '0';

    if (dir === 'FORWARD') { leftCode = speed; rightCode = speed; }
    else if (dir === 'BACKWARD') { leftCode = `-${speed}`; rightCode = `-${speed}`; }
    else if (dir === 'LEFT') { leftCode = `-${speed}`; rightCode = speed; }
    else if (dir === 'RIGHT') { leftCode = speed; rightCode = `-${speed}`; }

    return `if (gurumi.isExecutionActive(runId)) gurumi.setBothWheels(${leftCode}, ${rightCode});\n`;
};

Blockly.Blocks['stop_gurumi'] = {
    init: function() {
        this.appendDummyInput().appendField("gurumi 정지하기");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['stop_gurumi'] = function(block, generator) {
    return `if (gurumi.isExecutionActive(runId)) gurumi.stop();\n`;
};

Blockly.Blocks['wait_seconds'] = {
    init: function() {
        this.appendValueInput("SECONDS").setCheck("Number");
        this.appendDummyInput().appendField("초 동안 기다리기");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(60);
    }
};
javascript.javascriptGenerator.forBlock['wait_seconds'] = function(block, generator) {
    var seconds = generator.valueToCode(block, 'SECONDS', javascript.Order.ATOMIC) || '1';
    return `await gurumi.waitSec(${seconds}, runId);\n`;
};

Blockly.Blocks['console_log'] = {
    init: function() {
        this.appendValueInput("TEXT").appendField("콘솔에");
        this.appendDummyInput().appendField("출력하기");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(160);
    }
};
javascript.javascriptGenerator.forBlock['console_log'] = function(block, generator) {
    var msg = generator.valueToCode(block, 'TEXT', javascript.Order.NONE) || '""';
    return `if (gurumi.isExecutionActive(runId)) gurumi.log(${msg});\n`;
};

javascript.javascriptGenerator.forBlock['controls_whileUntil'] = function(block, generator) {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    let condition = generator.valueToCode(
        block,
        'BOOL',
        until ? javascript.Order.LOGICAL_NOT : javascript.Order.NONE
    ) || 'false';
    if (until) condition = `!${condition}`;
    let branch = generator.statementToCode(block, 'DO');
    branch = generator.addLoopTrap(branch, block);
    return `while ((${condition}) && gurumi.isExecutionActive(runId)) {\n` +
        `  await gurumi.yieldToSimulation();\n` +
        `  if (!gurumi.isExecutionActive(runId)) break;\n` +
        `${branch}}\n`;
};

javascript.javascriptGenerator.forBlock['controls_repeat_ext'] = function(block, generator) {
    const repeats = block.getField('TIMES')
        ? String(Number(block.getFieldValue('TIMES')))
        : generator.valueToCode(block, 'TIMES', javascript.Order.ASSIGNMENT) || '0';
    let branch = generator.statementToCode(block, 'DO');
    branch = generator.addLoopTrap(branch, block);
    const loopVariable = generator.nameDB_.getDistinctName(
        'count',
        Blockly.Names.NameType.VARIABLE
    );
    const repeatEndVariable = generator.nameDB_.getDistinctName(
        'repeat_end',
        Blockly.Names.NameType.VARIABLE
    );
    return `var ${repeatEndVariable} = ${repeats};\n` +
        `for (var ${loopVariable} = 0; ${loopVariable} < ${repeatEndVariable} && ` +
        `gurumi.isExecutionActive(runId); ${loopVariable}++) {\n` +
        `  await gurumi.yieldToSimulation();\n` +
        `  if (!gurumi.isExecutionActive(runId)) break;\n` +
        `${branch}}\n`;
};
// 1. "신호"를 받았을 때
Blockly.Blocks['when_receive_signal'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("📩")
            .appendField(new Blockly.FieldTextInput("신호1"), "SIGNAL_NAME")
            .appendField("신호를 받았을 때");
        this.appendStatementInput("DO");
        this.setColour(20);
        this.setTooltip("지정한 신호를 받았을 때 실행합니다.");
    }
};
javascript.javascriptGenerator.forBlock['when_receive_signal'] = function(block, generator) {
    const signalName = block.getFieldValue('SIGNAL_NAME');
    const branch = generator.statementToCode(block, 'DO');
    return `gurumiSignalSystem.register("${signalName}", async function(runId) {\n` +
           `  if (!gurumi.isExecutionActive(runId)) return;\n` +
           `${branch}\n` +
           `});\n`;
};

// 2. "신호" 보내기
Blockly.Blocks['send_signal'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("📨")
            .appendField(new Blockly.FieldTextInput("신호1"), "SIGNAL_NAME")
            .appendField("신호 보내기");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
        this.setTooltip("지정한 신호를 전송하고 바로 다음 블록을 실행합니다.");
    }
};
javascript.javascriptGenerator.forBlock['send_signal'] = function(block, generator) {
    const signalName = block.getFieldValue('SIGNAL_NAME');
    return `if (gurumi.isExecutionActive(runId)) {\n` +
           `  gurumiSignalSystem.emit("${signalName}", runId, false);\n` +
           `}\n`;
};

// 3. "신호" 보내고 기다리기
Blockly.Blocks['send_signal_and_wait'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("📨")
            .appendField(new Blockly.FieldTextInput("신호1"), "SIGNAL_NAME")
            .appendField("신호 보내고 기다리기");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
        this.setTooltip("신호를 받은 블록들의 처리 완료까지 기다린 후 다음을 실행합니다.");
    }
};
javascript.javascriptGenerator.forBlock['send_signal_and_wait'] = function(block, generator) {
    const signalName = block.getFieldValue('SIGNAL_NAME');
    return `if (gurumi.isExecutionActive(runId)) {\n` +
           `  await gurumiSignalSystem.emit("${signalName}", runId, true);\n` +
           `}\n`;
};

// 4. "참" 일 때 (조건 이벤트)
Blockly.Blocks['when_condition_true'] = {
    init: function() {
        this.appendValueInput("CONDITION")
            .setCheck("Boolean")
            .appendField("⚡");
        this.appendDummyInput()
            .appendField("일 때");
        this.appendStatementInput("DO");
        this.setColour(20);
        this.setTooltip("조건이 참(True)이 되는 순간 아래 블록을 실행합니다.");
    }
};
javascript.javascriptGenerator.forBlock['when_condition_true'] = function(block, generator) {
    const condition = generator.valueToCode(block, 'CONDITION', javascript.Order.NONE) || 'false';
    const branch = generator.statementToCode(block, 'DO');
    return `(async function() {\n` +
           `  let lastState = false;\n` +
           `  while (gurumi.isExecutionActive(runId)) {\n` +
           `    const currentState = Boolean(${condition});\n` +
           `    if (currentState && !lastState) {\n` +
           `${branch}\n` +
           `    }\n` +
           `    lastState = currentState;\n` +
           `    await gurumi.yieldToSimulation();\n` +
           `  }\n` +
           `})();\n`;
};
// === 4. Blockly 워크스페이스 주입 ===
var workspace = Blockly.inject('blockly-container', {
    toolbox: document.getElementById('toolbox'),
    scrollbars: true,
    zoom: { controls: true, wheel: true },
    renderer: 'zelos' // 👈 'zelos'로 설정하면 스크래치(Scratch) 스타일의 둥글둥글한 모양이 됩니다!
});

// === 5. 콘솔 패널 높이 조절 드래그 로직 ===
const rightPanel = document.getElementById('right-panel');
const consoleResizeHandle = document.getElementById('console-resize-handle');
const btnClearConsole = document.getElementById('btn-clear-console');
let isResizingConsole = false;

if (consoleResizeHandle && rightPanel) {
    consoleResizeHandle.addEventListener('pointerdown', (e) => {
        isResizingConsole = true;
        consoleResizeHandle.classList.add('dragging');
        consoleResizeHandle.setPointerCapture(e.pointerId);
    });

    consoleResizeHandle.addEventListener('pointermove', (e) => {
        if (!isResizingConsole) return;
        const panelRect = rightPanel.getBoundingClientRect();
        let newConsoleHeight = panelRect.bottom - e.clientY;
        
        // 최소/최대 높이 범위 지정
        if (newConsoleHeight < 32) newConsoleHeight = 32;
        if (newConsoleHeight > panelRect.height * 0.8) newConsoleHeight = panelRect.height * 0.8;

        rightPanel.style.setProperty('--console-height', `${newConsoleHeight}px`);
        Blockly.svgResize(workspace);
    });

    const stopConsoleResize = (e) => {
        if (isResizingConsole) {
            isResizingConsole = false;
            consoleResizeHandle.classList.remove('dragging');
            if (consoleResizeHandle.hasPointerCapture(e.pointerId)) {
                consoleResizeHandle.releasePointerCapture(e.pointerId);
            }
            Blockly.svgResize(workspace);
        }
    };

    consoleResizeHandle.addEventListener('pointerup', stopConsoleResize);
    consoleResizeHandle.addEventListener('pointercancel', stopConsoleResize);
}

if (btnClearConsole) {
    btnClearConsole.addEventListener('click', () => {
        const logsContainer = document.getElementById('console-logs');
        if (logsContainer) logsContainer.innerHTML = '';
    });
}

// === 6. 블록 코드 실행 및 정지 함수 ===
function startBlockCode() {
    const runId = ++window.gurumi.executionId;
    window.gurumi.isBlockControlled = true;
    gurumiSignalSystem.reset(); // 신호 시스템 초기화
    
    try {
        const generator = javascript.javascriptGenerator;
        generator.init(workspace);
        
        // 최상위 이벤트 블록들 추출 및 코드 생성
        const eventBlocks = workspace.getTopBlocks(true);
        const blockCode = eventBlocks
            .map(block => generator.blockToCode(block))
            .join('\n');
            
        const code = generator.finish(blockCode);
        const execute = new Function(
            'gurumi',
            'runId',
            'gurumiSignalSystem',
            `return (async function() {\n${code}\n})();`
        );
        execute(window.gurumi, runId, window.gurumiSignalSystem).catch(error => {
            console.error('블록 코드 실행 중 오류:', error);
            if (window.gurumi.executionId === runId) stopBlockCode();
        });
    } catch (error) {
        console.error('블록 코드 생성 중 오류:', error);
        if (window.gurumi.executionId === runId) stopBlockCode();
    }
}

function stopBlockCode() {
    window.gurumi.executionId++;
    window.gurumi.isBlockControlled = false;
    window.gurumi.stop();
}