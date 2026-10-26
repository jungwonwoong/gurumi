const simContainer = document.getElementById('sim-container')
const blocklyContainer = document.getElementById('blockly-container')
const resizeHandle = document.getElementById('resize-handle')
let paneRatio = 0.5
let resizePointerId = null

function onWindowResize() {
    document.body.style.setProperty('--sim-width', `${window.innerWidth * paneRatio}px`)
    simContainer.style.visibility = paneRatio === 0 ? 'hidden' : 'visible'
    blocklyContainer.style.visibility = paneRatio === 1 ? 'hidden' : 'visible'
    window.gurumiSimulation?.resize()
    Blockly.svgResize(workspace)
}

function setPaneRatio(ratio) {
    paneRatio = ratio <= 0.01 ? 0 : ratio >= 0.99 ? 1 : Math.max(0, Math.min(1, ratio))
    resizeHandle.setAttribute('aria-valuenow', String(Math.round(paneRatio * 100)))
    onWindowResize()
}

window.addEventListener('resize', onWindowResize)
resizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    resizePointerId = event.pointerId
    resizeHandle.setPointerCapture(event.pointerId)
    resizeHandle.classList.add('dragging')
    setPaneRatio(event.clientX / window.innerWidth)
})
resizeHandle.addEventListener('pointermove', (event) => {
    if (event.pointerId !== resizePointerId) return
    setPaneRatio(event.clientX / window.innerWidth)
})

function finishResize(event) {
    if (event.pointerId !== resizePointerId) return
    resizePointerId = null
    resizeHandle.classList.remove('dragging')
    if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId)
    }
}

resizeHandle.addEventListener('pointerup', finishResize)
resizeHandle.addEventListener('pointercancel', finishResize)
resizeHandle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        setPaneRatio(paneRatio + (event.key === 'ArrowRight' ? 0.05 : -0.05))
    } else if (event.key === 'Home') {
        event.preventDefault()
        setPaneRatio(0)
    } else if (event.key === 'End') {
        event.preventDefault()
        setPaneRatio(1)
    }
})
