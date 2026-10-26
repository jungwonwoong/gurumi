window.gurumiPhoneControl = {
    drive: 0,
    pitch: 0,
    orbit: { rotateX: 0, rotateY: 0, panX: 0, panY: 0, zoom: 0 }
}

const peerId = `gurumi-${Math.floor(1000 + Math.random() * 9000)}`
const phoneUrl = 'https://192.168.0.201:5500/phone_controller.html?code=' + peerId.replace('gurumi-', '')
const phoneStatus = document.getElementById('phone-status')

new QRCode(document.getElementById('qrcode'), {
    text: phoneUrl,
    width: 90,
    height: 90
})

const peer = new Peer(peerId)
peer.on('connection', (connection) => {
    phoneStatus.textContent = '🟢 스마트폰 연결됨!'
    phoneStatus.classList.add('connected')

    connection.on('data', (data) => {
        if (!data || typeof data !== 'object') return
        if (data.drive === 'FORWARD') window.gurumiPhoneControl.drive = 1
        else if (data.drive === 'BACKWARD') window.gurumiPhoneControl.drive = -1
        else window.gurumiPhoneControl.drive = 0

        if (Number.isFinite(data.pitch)) window.gurumiPhoneControl.pitch = data.pitch

        if (data.orbit) {
            for (const key of ['rotateX', 'rotateY', 'panX', 'panY', 'zoom']) {
                if (Number.isFinite(data.orbit[key])) {
                    window.gurumiPhoneControl.orbit[key] += Math.max(-1, Math.min(1, data.orbit[key]))
                }
            }
        }
    })

    connection.on('close', () => {
        phoneStatus.textContent = '🔴 스마트폰 연결 끊김'
        phoneStatus.classList.remove('connected')
        window.gurumiPhoneControl.drive = 0
        window.gurumiPhoneControl.pitch = 0
        window.gurumiPhoneControl.orbit = { rotateX: 0, rotateY: 0, panX: 0, panY: 0, zoom: 0 }
    })
})

peer.on('error', (error) => {
    console.error('Smartphone connection failed.', error)
    phoneStatus.textContent = '스마트폰 연결 오류'
    phoneStatus.classList.remove('connected')
})
