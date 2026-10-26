import * as THREE from 'three'
            import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
            import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
            import { GUI } from 'dat.gui'
            import * as CANNON from 'cannon-es'
            import CannonDebugRenderer from './cannonDebugRenderer.js'

            const simulationRoot = document.getElementById('sim-container') ?? document.body
            const scene = new THREE.Scene()
            function getSimulationSize() {
                return simulationRoot === document.body
                    ? { width: window.innerWidth, height: window.innerHeight }
                    : { width: simulationRoot.clientWidth, height: simulationRoot.clientHeight }
            }

            const displaySettings = {
                showPhysicsShapes: false,
                hideBody00: false,
                hideBody01: false,
                hideEle: false,
                hideBat: false
            }
            let body00Model = null
            let body01Model = null
            let eleModel = null
            let batModel = null

            function setModelHidden(model, hidden) {
                if (model) model.visible = !hidden
            }
           const gurumiOledCanvas = document.createElement('canvas')
            gurumiOledCanvas.width = 128
            gurumiOledCanvas.height = 64
            const gurumiOledContext = gurumiOledCanvas.getContext('2d')
            const gurumiOledTexture = new THREE.CanvasTexture(gurumiOledCanvas)
            gurumiOledTexture.colorSpace = THREE.SRGBColorSpace
            gurumiOledTexture.minFilter = THREE.NearestFilter
            gurumiOledTexture.magFilter = THREE.NearestFilter
            gurumiOledTexture.generateMipmaps = false
            let gurumiOledFaceMesh = null
            let gurumiOledLastDraw = 0
            let gurumiOledBlinkUntil = 0
            let gurumiOledNextBlink = performance.now() + 1800

            function drawGurumiOled(now = performance.now(), pitch = 0, roll = 0, speed = 0) {
                const ctx = gurumiOledContext
                ctx.fillStyle = '#000'
                ctx.fillRect(0, 0, 128, 64)

                const lookX = Math.max(-5, Math.min(5, Math.round(roll * 9)))
                const lookY = Math.max(-3, Math.min(3, Math.round(pitch * 8)))
                const surprised = Math.abs(pitch) > 0.42 || Math.abs(roll) > 0.48
                const happy = speed > 12 && !surprised
                const blinking = now < gurumiOledBlinkUntil

                if (now >= gurumiOledNextBlink && !blinking) {
                    gurumiOledBlinkUntil = now + 170
                    gurumiOledNextBlink = now + 2200 + Math.random() * 2600
                }

                ctx.fillStyle = '#fff'
                if (blinking) {
                    ctx.lineWidth = 4
                    ctx.lineCap = 'round'
                    ctx.beginPath()
                    ctx.moveTo(20, 32); ctx.lineTo(49, 32)
                    ctx.moveTo(79, 32); ctx.lineTo(108, 32)
                    ctx.strokeStyle = '#fff'
                    ctx.stroke()
                } else {
                    const eyeY = surprised ? 10 : (happy ? 22 : 14)
                    const eyeHeight = surprised ? 43 : (happy ? 25 : 36)
                    ctx.beginPath()
                    ctx.roundRect(16, eyeY, 34, eyeHeight, 10)
                    ctx.roundRect(78, eyeY, 34, eyeHeight, 10)
                    ctx.fill()
                    const pupilY = eyeY + eyeHeight / 2 + lookY
                    const pupilX1 = 33 + lookX
                    const pupilX2 = 95 + lookX
                    ctx.fillStyle = '#000'
                    ctx.beginPath()
                    ctx.arc(pupilX1, pupilY, surprised ? 6 : 7, 0, Math.PI * 2)
                    ctx.arc(pupilX2, pupilY, surprised ? 6 : 7, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.fillStyle = '#fff'
                    ctx.beginPath()
                    ctx.arc(pupilX1 - 2, pupilY - 2, 2, 0, Math.PI * 2)
                    ctx.arc(pupilX2 - 2, pupilY - 2, 2, 0, Math.PI * 2)
                    ctx.fill()
                }

                ctx.strokeStyle = '#fff'
                ctx.lineWidth = 2
                if (surprised) {
                    ctx.beginPath()
                    ctx.ellipse(64, 55, 4, 5, 0, 0, Math.PI * 2)
                    ctx.stroke()
                } else if (happy) {
                    ctx.beginPath()
                    ctx.arc(64, 48, 9, 0.15, Math.PI - 0.15)
                    ctx.stroke()
                } else {
                    ctx.fillStyle = '#fff'
                    ctx.fillRect(60, 54, 8, 2)
                }
                gurumiOledTexture.needsUpdate = true
            }

            const fillLight = new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 1.5)
            scene.add(fillLight)
            const cameraPreviewFillLight = new THREE.AmbientLight(0xffffff, 1.5)
            cameraPreviewFillLight.visible = false
            scene.add(cameraPreviewFillLight)
            const cameraPreviewBackground = new THREE.Color(0x000000)

             const light = new THREE.DirectionalLight(0xffffff, 2)
             light.position.set(25, 50, 25)
             light.castShadow = true
             light.shadow.mapSize.width = 1024
             light.shadow.mapSize.height = 1024
             light.shadow.camera.near = 0.5
             light.shadow.camera.far = 100
             light.shadow.camera.top = 100
             light.shadow.camera.bottom = -100
             light.shadow.camera.left = -100
             light.shadow.camera.right = 100
             scene.add(light)
				// LIGHTS
				// const ambientLight = new THREE.AmbientLight( 0x999999, 2.0 );

				// const light = new THREE.DirectionalLight( 0xFFFFFF, 2.0 );
				// light.position.set( 0.32, 0.39, 0.7 );
                // 				scene.add( ambientLight );
				// scene.add( light );
            const helper = new THREE.CameraHelper(light.shadow.camera)
            //scene.add(helper)

            const initialSize = getSimulationSize()
            const camera = new THREE.PerspectiveCamera(75, initialSize.width / Math.max(initialSize.height, 1), 0.1, 1000)
            camera.position.set(0, 3, 1)

            const renderer = new THREE.WebGLRenderer()
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
            renderer.setSize(initialSize.width, initialSize.height)
            renderer.shadowMap.enabled = true
            renderer.shadowMap.type = THREE.PCFSoftShadowMap
            renderer.domElement.style.touchAction = 'none'
            renderer.domElement.style.position = 'absolute'
            renderer.domElement.style.left = '0'
            renderer.domElement.style.top = '0'
            simulationRoot.appendChild(renderer.domElement)

            const controls = new OrbitControls(camera, renderer.domElement)
            controls.target.set(0, 0.9, 0)
            controls.enableDamping = true
            controls.minPolarAngle = 0.05
            controls.maxPolarAngle = Math.PI - 0.05

            function applyPhoneOrbit() {
                const phoneControl = window.gurumiPhoneControl
                if (!phoneControl) return
                const { rotateX, rotateY, panX, panY, zoom } = phoneControl.orbit
                phoneControl.orbit = { rotateX: 0, rotateY: 0, panX: 0, panY: 0, zoom: 0 }

                if (rotateX !== 0 || rotateY !== 0) {
                    const offset = camera.position.clone().sub(controls.target)
                    const spherical = new THREE.Spherical().setFromVector3(offset)
                    spherical.theta -= rotateX * Math.PI * 2
                    spherical.phi -= rotateY * Math.PI * 2
                    spherical.makeSafe()
                    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
                }

                if (panX !== 0 || panY !== 0) {
                    const offset = camera.position.clone().sub(controls.target)
                    const viewHeight = 2 * offset.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
                    const direction = controls.target.clone().sub(camera.position).normalize()
                    const right = direction.clone().cross(camera.up).normalize()
                    const up = right.clone().cross(direction).normalize()
                    const panOffset = right.multiplyScalar(-panX * viewHeight * camera.aspect)
                        .add(up.multiplyScalar(panY * viewHeight))
                    camera.position.add(panOffset)
                    controls.target.add(panOffset)
                }

                if (zoom !== 0) {
                    const offset = camera.position.clone().sub(controls.target)
                    const nextDistance = THREE.MathUtils.clamp(
                        offset.length() * Math.exp(-zoom * 2),
                        0.5,
                        200
                    )
                    camera.position.copy(controls.target).add(offset.setLength(nextDistance))
                }
            }

            const phongMaterial = new THREE.MeshPhongMaterial()

            const world = new CANNON.World()
            world.gravity.set(0, -30, 0)
            world.solver.iterations = 20

            const groundMaterial = new CANNON.Material('groundMaterial')
            groundMaterial.friction = 0.25
            groundMaterial.restitution = 0

            const wheelMaterial = new CANNON.Material('wheelMaterial')
            wheelMaterial.friction = 0.25
            wheelMaterial.restitution = 0
            //ground

            const groundGeometry = new THREE.PlaneGeometry(100, 100)


            const groundVisualMaterial = new THREE.MeshPhongMaterial({ color: 0x65c4fb })
            const groundMesh = new THREE.Mesh(groundGeometry, groundVisualMaterial)
            const obstaclePlacementSurfaces = [groundMesh]
            const obstacleCollisionMeshes = []
            groundMesh.rotateX(-Math.PI / 2)
            groundMesh.receiveShadow = true
            scene.add(groundMesh)

            const groundShape = new CANNON.Box(new CANNON.Vec3(50, 1, 50))

            const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial })
            groundBody.addShape(groundShape)
            groundBody.position.set(0, -1, 0)
            world.addBody(groundBody)

            const stairCount = 10
            const stairWidth = 4
            const stairHeight = 0.2
            const stairDepth = 1
            const obstacleSize = new THREE.Vector3(0.6, stairHeight, 0.6)
            for (let i = 0; i < stairCount; i++) {
                const height = stairHeight * (i + 1)
                const stairMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(stairWidth, height, stairDepth),
                    phongMaterial
                )
                stairMesh.position.set(0, height / 2, -5 - stairDepth * (i + 0.5))
                stairMesh.castShadow = true
                stairMesh.receiveShadow = true
                scene.add(stairMesh)
                obstaclePlacementSurfaces.push(stairMesh)
                obstacleCollisionMeshes.push(stairMesh)

                const stairBody = new CANNON.Body({ mass: 0 })
                stairBody.addShape(new CANNON.Box(
                    new CANNON.Vec3(stairWidth / 2, height / 2, stairDepth / 2)
                ))
                stairBody.position.set(stairMesh.position.x, stairMesh.position.y, stairMesh.position.z)
                world.addBody(stairBody)
            }
            for (let i = 0; i < stairCount; i++) {
                const height = stairHeight * (stairCount - i)
                const stairMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(stairWidth, height, stairDepth),
                    phongMaterial
                )
                stairMesh.position.set(0, height / 2, -5 - stairDepth * (stairCount + i + 0.5))
                stairMesh.castShadow = true
                stairMesh.receiveShadow = true
                scene.add(stairMesh)
                obstaclePlacementSurfaces.push(stairMesh)
                obstacleCollisionMeshes.push(stairMesh)

                const stairBody = new CANNON.Body({ mass: 0 })
                stairBody.addShape(new CANNON.Box(
                    new CANNON.Vec3(stairWidth / 2, height / 2, stairDepth / 2)
                ))
                stairBody.position.set(stairMesh.position.x, stairMesh.position.y, stairMesh.position.z)
                world.addBody(stairBody)
            }

            //jumps


            const carBodyMesh = new THREE.Group()
            carBodyMesh.position.y = 0.9
            scene.add(carBodyMesh)
            const cameraPreview = document.getElementById('camera-preview')
            const cameraPreviewCanvas = document.getElementById('camera-preview-canvas')
            const cameraPreviewContext = cameraPreviewCanvas.getContext('2d')
            const onboardCamera = new THREE.PerspectiveCamera(70, 16 / 9, 0.01, 100)
            onboardCamera.position.set(0, 0.724, -0.56)
            carBodyMesh.add(onboardCamera)
            const onboardCameraHelper = new THREE.CameraHelper(onboardCamera)
            scene.add(onboardCameraHelper)
            const carMotorMesh = new THREE.Group()
            carBodyMesh.add(carMotorMesh)
            const carOLEDMesh = new THREE.Group()
            carOLEDMesh.position.x = -0.005
            carOLEDMesh.position.y = 0
            carOLEDMesh.position.z = -0
            carBodyMesh.add(carOLEDMesh)
            const carModelLoader = new GLTFLoader()
            carModelLoader.load(
                './mesh/gurumi_body_00.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.copy(center).multiplyScalar(-scale)
                    //ㅁㅈmodel.rotation.y = Math.PI / 2
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = true
                            child.receiveShadow = true
                        }
                    })

                    body00Model = model
                    setModelHidden(body00Model, displaySettings.hideBody00)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )
            carModelLoader.load(
                './mesh/gurumi_body_01.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const body01Material = new THREE.MeshStandardMaterial({
                        color: 0xff0000,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = body01Material
                            child.castShadow = false
                            child.receiveShadow = true
                        }
                    })

                    body01Model = model
                    setModelHidden(body01Model, displaySettings.hideBody01)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )
            carModelLoader.load(
                './mesh/gurumi_camera.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/3.87, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const body01Material = new THREE.MeshStandardMaterial({
                        color: 0xff0000,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = body01Material
                            child.castShadow = false
                            child.receiveShadow = true
                        }
                    })

                    // body01Model = model
                    // setModelHidden(body01Model, displaySettings.hideBody01)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )
            carModelLoader.load(
                './mesh/gurumi_screw_body_01.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x/1.244, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const body01Material = new THREE.MeshStandardMaterial({
                        color: 0x000000,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = body01Material
                            child.castShadow = false
                            child.receiveShadow = true
                        }
                    })

                    // body01Model = model
                    // setModelHidden(body01Model, displaySettings.hideBody01)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )
             carModelLoader.load(
                './mesh/gurumi_ele.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = true
                            child.receiveShadow = true
                        }
                    })

                    eleModel = model
                    setModelHidden(eleModel, displaySettings.hideEle)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_ele.glb', error)
                }
            )
             carModelLoader.load(
                './mesh/gurumi_OLED.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/1.6, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = true
                            child.receiveShadow = true
                        }
                    })

                    carOLEDMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_ele.glb', error)
                }
            )
             carModelLoader.load(
                './mesh/gurumi_OLED_p.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/2.98, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.315, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0x000000,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = true
                            child.receiveShadow = true
                        }
                    })

                    //carOLEDMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_ele.glb', error)
                }
            )
                //oled display
            const oledGeometry = new THREE.PlaneGeometry(0.62, 0.66 / 1.97)
            const oledMaterial = new THREE.MeshBasicMaterial({
                map: gurumiOledTexture,
                color: 0xffffff,
                side: THREE.DoubleSide,
                toneMapped: false
            })
            gurumiOledFaceMesh = new THREE.Mesh(oledGeometry, oledMaterial)
            gurumiOledFaceMesh.name = 'Gurumi_OLED_CanvasTexture'
            gurumiOledFaceMesh.rotation.y = -Math.PI
            gurumiOledFaceMesh.position.set(
                0,
                0.31,
                -0.601
            )
            gurumiOledFaceMesh.renderOrder = 20
            carOLEDMesh.add(gurumiOledFaceMesh)
            drawGurumiOled()

             carModelLoader.load(
                './mesh/gurumi_bat.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x/1.3, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.287, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    batModel = model
                    setModelHidden(batModel, displaySettings.hideBat)
                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_ele.glb', error)
                }
            )
            carModelLoader.load(
                './mesh/gurumi_wheel_rab.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x/1.03, 1 / size.y/1.03, 2 / size.z/1.03)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.27, 0)
                    //model.position.copy(center).multiplyScalar(-scale)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0x000000,
                        metalness: 0,
                        roughness: 0.35
                    })

                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )


            carModelLoader.load(
                './mesh/gurumi_bearing.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/4.9, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.27, 0)
                    //model.position.copy(center).multiplyScalar(-scale)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        emissive: 0x000000,
                        metalness: 0.7,
                        roughness: 0.1
                    })

                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   
            carModelLoader.load(
                './mesh/gurumi_axis.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x/0.982, 1 / size.y, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.27, 0)
                    //model.position.copy(center).multiplyScalar(-scale)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xfae500,
                        emissive: 0x000000,
                        metalness: 0.7,
                        roughness: 0.1
                    })

                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    carBodyMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   

            carModelLoader.load(
                './mesh/gurumi_motor.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/4, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(0, -0.27, 0)
                    //model.position.copy(center).multiplyScalar(-scale)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xFFFFFF,
                        emissive: 0x000000,
                        metalness: 0.7,
                        roughness: 0.1
                    })

                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    carMotorMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   

            const carBodyShape = new CANNON.Box(new CANNON.Vec3(0.5,0.4, 0.56))
            const carBody = new CANNON.Body({ mass: 5 })
            carBody.addShape(carBodyShape, new CANNON.Vec3(0, 0.23, 0))
            carBody.position.x = carBodyMesh.position.x
            carBody.position.y = carBodyMesh.position.y
            carBody.position.z = carBodyMesh.position.z
            world.addBody(carBody)
            const wheelShapeOrientation = new CANNON.Quaternion()
            wheelShapeOrientation.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2)
            const wheelRadius = 0.235
            const wheelThickness = 0.074
            const wheelCenterY = 0.4
            //front left wheel

            const wheelLFMesh = new THREE.Group()
            //wheelLFMesh.position.set(-18.75, 9.1, -16.49)
            scene.add(wheelLFMesh)
            carModelLoader.load(
                './mesh/gurumi_wheel.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/2.37, 2 / size.z)

                    model.scale.setScalar(scale)
                    //model.position.set(0, -0.27, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.position.copy(center).multiplyScalar(-scale)
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    wheelLFMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   

            const wheelLFShape = new CANNON.Cylinder(wheelRadius, wheelRadius, wheelThickness, 16)
            const wheelLFBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelLFBody.addShape(wheelLFShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelLFBody.position.x = wheelLFMesh.position.x
            wheelLFBody.position.y = wheelLFMesh.position.y
            wheelLFBody.position.z = wheelLFMesh.position.z
            world.addBody(wheelLFBody)
            //front right wheel

            const wheelRFMesh = new THREE.Group()
            //wheelRFMesh.position.set(-18.75, 9.1, -16.49)
            //wheelRFMesh.rotation.y = Math.PI
            scene.add(wheelRFMesh)
            carModelLoader.load(
                './mesh/gurumi_wheel_r.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/2.37, 2 / size.z)

                    model.scale.setScalar(scale)
                    //model.position.set(0, -1.27, 0)
                    //model.rotation.y = Math.PI
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.position.copy(center).multiplyScalar(-scale)
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    wheelRFMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   

            const wheelRFShape = new CANNON.Cylinder(wheelRadius, wheelRadius, wheelThickness, 16)
            const wheelRFBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelRFBody.addShape(wheelRFShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelRFBody.position.x = wheelRFMesh.position.x
            wheelRFBody.position.y = wheelRFMesh.position.y
            wheelRFBody.position.z = wheelRFMesh.position.z
            world.addBody(wheelRFBody)
            //back left wheel
            const wheelLBMesh = new THREE.Group()
            //wheelLBMesh.position.set(-18.75, 9.1, -16.49)
            scene.add(wheelLBMesh)
            carModelLoader.load(
                './mesh/gurumi_wheel.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/2.37, 2 / size.z)

                    model.scale.setScalar(scale)
                    //model.position.set(0, -0.27, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.position.copy(center).multiplyScalar(-scale)
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    wheelLBMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   
            const wheelLBShape = new CANNON.Cylinder(wheelRadius, wheelRadius, wheelThickness, 16)
            const wheelLBBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelLBBody.addShape(wheelLBShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelLBBody.position.x = wheelLBMesh.position.x
            wheelLBBody.position.y = wheelLBMesh.position.y
            wheelLBBody.position.z = wheelLBMesh.position.z
            world.addBody(wheelLBBody)
            //back right wheel
            const wheelRBMesh = new THREE.Group()
            //wheelRBMesh.position.set(18.75, 9.1, 16.49)
            scene.add(wheelRBMesh)
            carModelLoader.load(
                './mesh/gurumi_wheel_r.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/2.37, 2 / size.z)

                    model.scale.setScalar(scale)
                   //model.position.set(0, -0.27, 0)
                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })
                    model.position.copy(center).multiplyScalar(-scale)
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    wheelRBMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )   
            const wheelRBShape = new CANNON.Cylinder(wheelRadius, wheelRadius, wheelThickness, 16)
            const wheelRBBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelRBBody.addShape(wheelRBShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelRBBody.position.x = wheelRBMesh.position.x
            wheelRBBody.position.y = wheelRBMesh.position.y
            wheelRBBody.position.z = wheelRBMesh.position.z
            world.addBody(wheelRBBody)
            const wheelUFMesh = new THREE.Group()
            wheelUFMesh.position.set(0, 1, 1)
            scene.add(wheelUFMesh)
            const wheelUFShape = new CANNON.Cylinder(0, 0.112, 0.1, 3)
            const wheelUFBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelUFBody.addShape(wheelUFShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelUFBody.position.set(
                wheelUFMesh.position.x,
                wheelUFMesh.position.y,
                wheelUFMesh.position.z
            )
            world.addBody(wheelUFBody)

            const wheelUBMesh = new THREE.Group()
            wheelUBMesh.position.set(0, 1, -1)
            scene.add(wheelUBMesh)
            const wheelUBShape = new CANNON.Cylinder(0, 0.112, 0.1, 3)
            const wheelUBBody = new CANNON.Body({ mass: 1, material: wheelMaterial })
            wheelUBBody.addShape(wheelUBShape, new CANNON.Vec3(), wheelShapeOrientation)
            wheelUBBody.position.set(
                wheelUBMesh.position.x,
                wheelUBMesh.position.y,
                wheelUBMesh.position.z
            )
            world.addBody(wheelUBBody)

            const hiddenWheelBodies = []
            const hiddenWheelCountPerSide = 3
            const hiddenWheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness)
            hiddenWheelGeometry.rotateZ(Math.PI / 2)
            for (const x of [-1, 1]) {
                for (let i = 1; i <= hiddenWheelCountPerSide; i++) {
                    const z = -1 + (2 * i) / (hiddenWheelCountPerSide + 1)
                    const mesh = new THREE.Mesh(hiddenWheelGeometry, phongMaterial)
                    mesh.position.set(x, wheelCenterY, z)
                    mesh.castShadow = false
                    mesh.receiveShadow = false
                    mesh.visible = false
                    scene.add(mesh)

                    const body = new CANNON.Body({ mass: 1, material: wheelMaterial })
                    body.addShape(
                        new CANNON.Cylinder(wheelRadius, wheelRadius, wheelThickness, 16),
                        new CANNON.Vec3(),
                        wheelShapeOrientation
                    )
                    body.position.set(x, wheelCenterY, z)
                    world.addBody(body)
                    hiddenWheelBodies.push({ body, mesh, x, z })
                }
            }
            const wheelBodies = [
                wheelLFBody,
                wheelRFBody,
                wheelLBBody,
                wheelRBBody,
                wheelUFBody,
                ...hiddenWheelBodies.map(({ body }) => body)
            ]
            const wheelCollisionGroup = 2
            for (const body of wheelBodies) {
                body.collisionFilterGroup = wheelCollisionGroup
                body.collisionFilterMask = ~wheelCollisionGroup
            }
            carModelLoader.load(
                './mesh/gurumi_gear_1.glb',
                (gltf) => {
                    const model = gltf.scene
                    const bounds = new THREE.Box3().setFromObject(model)
                    const size = bounds.getSize(new THREE.Vector3())
                    const center = bounds.getCenter(new THREE.Vector3())
                    if (size.x === 0 || size.y === 0 || size.z === 0) {
                        console.error('Car model has invalid dimensions and cannot be scaled.')
                        return
                    }
                    const scale = Math.min(1 / size.x, 1 / size.y/3.5, 2 / size.z)

                    model.scale.setScalar(scale)
                    model.position.set(-0.73, -0.155, -1.8)

                    const whitePlastic = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0.35
                    })

                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.deleteAttribute('color')
                            if (!child.geometry.attributes.normal) {
                                child.geometry.computeVertexNormals()
                            }
                            child.material = whitePlastic
                            child.castShadow = false
                            child.receiveShadow = false
                        }
                    })

                    wheelRBMesh.add(model)
                },
                undefined,
                (error) => {
                    console.error('Failed to load car model ./mesh/gurumi_body_00.glb', error)
                }
            )

            const leftFrontAxis = new CANNON.Vec3(1, 0, 0)
            const rightFrontAxis = new CANNON.Vec3(1, 0, 0)
            const leftBackAxis = new CANNON.Vec3(1, 0, 0)
            const rightBackAxis = new CANNON.Vec3(1, 0, 0)
            const axleMaxForce = 1e6
            const constraintLF = new CANNON.HingeConstraint(carBody, wheelLFBody, {
                pivotA: new CANNON.Vec3(-0.47, -0.045, -0.41),
                pivotB: new CANNON.Vec3(),
                axisA: leftFrontAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintLF)
            const constraintRF = new CANNON.HingeConstraint(carBody, wheelRFBody, {
                pivotA: new CANNON.Vec3(0.47, -0.045, -0.41),
                pivotB: new CANNON.Vec3(),
                axisA: rightFrontAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintRF)
            const constraintLB = new CANNON.HingeConstraint(carBody, wheelLBBody, {
                pivotA: new CANNON.Vec3(-0.47, -0.045, 0.41),
                pivotB: new CANNON.Vec3(),
                axisA: leftBackAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintLB)
            const constraintRB = new CANNON.HingeConstraint(carBody, wheelRBBody, {
                pivotA: new CANNON.Vec3(0.47, -0.045, 0.41),
                pivotB: new CANNON.Vec3(),
                axisA: rightBackAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintRB)
            const constraintUF = new CANNON.HingeConstraint(carBody, wheelUFBody, {
                pivotA: new CANNON.Vec3(0.3, -0.045, 0.17),
                pivotB: new CANNON.Vec3(),
                axisA: rightBackAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintUF)
            const constraintUB = new CANNON.HingeConstraint(carBody, wheelUBBody, {
                pivotA: new CANNON.Vec3(-0.3, -0.045, -0.17),
                pivotB: new CANNON.Vec3(),
                axisA: rightBackAxis,
                maxForce: axleMaxForce
            })
            world.addConstraint(constraintUB)

            const hiddenWheelConstraints = hiddenWheelBodies.map(({ body, x, z }) => {
                const constraint = new CANNON.HingeConstraint(carBody, body, {
                    pivotA: new CANNON.Vec3(0, -0.045, z/2),
                    pivotB: new CANNON.Vec3(),
                    axisA: new CANNON.Vec3(1, 0, 0),
                    maxForce: axleMaxForce
                })
                world.addConstraint(constraint)
                constraint.enableMotor()
                return { constraint, x }
            })
            //Four-wheel drive
            constraintLF.enableMotor()
            constraintRF.enableMotor()
            constraintLB.enableMotor()
            constraintRB.enableMotor()
            constraintUF.enableMotor()
            constraintUB.enableMotor()
            const DRIVE_SPEED = 7
            const joystick = document.getElementById('mobile-joystick')
            const joystickKnob = document.getElementById('mobile-joystick-knob')
            const joystickSettings = {
                drive: 0,
                turn: 0,
                pointerId: null
            }

            function resetJoystick() {
                joystickSettings.drive = 0
                joystickSettings.turn = 0
                joystickSettings.pointerId = null
                joystick.style.setProperty('--joystick-x', '0px')
                joystick.style.setProperty('--joystick-y', '0px')
            }

            function updateJoystick(event) {
                const bounds = joystick.getBoundingClientRect()
                const centerX = bounds.left + bounds.width / 2
                const centerY = bounds.top + bounds.height / 2
                const maxTravel = (bounds.width - joystickKnob.offsetWidth) / 2
                let x = (event.clientX - centerX) / maxTravel
                let y = (event.clientY - centerY) / maxTravel
                const magnitude = Math.hypot(x, y)
                if (magnitude > 1) {
                    x /= magnitude
                    y /= magnitude
                }

                const deadZone = 0.08
                joystickSettings.turn = Math.abs(x) < deadZone ? 0 : x
                joystickSettings.drive = Math.abs(y) < deadZone ? 0 : -y
                joystick.style.setProperty('--joystick-x', `${x * maxTravel}px`)
                joystick.style.setProperty('--joystick-y', `${y * maxTravel}px`)
            }

            const supportsTouch = window.matchMedia('(pointer: coarse)').matches
            if (supportsTouch) joystick.classList.add('visible')
            joystick.addEventListener('pointerdown', (event) => {
                if (event.button !== 0 || placingObstacle || deletingObstacles) return
                event.preventDefault()
                joystickSettings.pointerId = event.pointerId
                joystick.setPointerCapture(event.pointerId)
                controls.enabled = false
                updateJoystick(event)
            })
            joystick.addEventListener('pointermove', (event) => {
                if (event.pointerId !== joystickSettings.pointerId) return
                event.preventDefault()
                updateJoystick(event)
            })
            const releaseJoystick = (event) => {
                if (event.pointerId !== joystickSettings.pointerId) return
                resetJoystick()
                controls.enabled = !deletingObstacles && !placingObstacle
            }
            joystick.addEventListener('pointerup', releaseJoystick)
            joystick.addEventListener('pointercancel', releaseJoystick)
            joystick.addEventListener('lostpointercapture', releaseJoystick)
            const carBodies = [
                carBody,
                wheelLFBody,
                wheelRFBody,
                wheelLBBody,
                wheelRBBody,
                wheelUFBody,
                wheelUBBody,
                ...hiddenWheelBodies.map(({ body }) => body)
            ]
            const keyMap = {}
            const onDocumentKey = (e) => {
                keyMap[e.code] = e.type === 'keydown'
                return false
            }
            document.addEventListener('keydown', onDocumentKey)
            document.addEventListener('keyup', onDocumentKey)
            window.addEventListener('resize', onWindowResize, false)
            function onWindowResize() {
                const { width, height } = getSimulationSize()
                camera.aspect = width > 0 && height > 0 ? width / height : 1
                camera.updateProjectionMatrix()
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                renderer.setSize(width, height)
                render()
            }
            window.gurumiSimulation = { resize: onWindowResize }
            // const stats = new Stats()
            // stats.dom.style.position = 'absolute'
            // stats.dom.style.top = '0'
            // stats.dom.style.left = '0'
            // stats.dom.style.zIndex = '5'
            // simulationRoot.appendChild(stats.dom)
            const gui = new GUI()
            gui.domElement.style.transform = simulationRoot === document.body ? 'scale(2)' : 'scale(0.75)'
            gui.domElement.style.transformOrigin = 'top right'
            const guiContainer = gui.domElement.parentElement
            guiContainer.style.position = 'absolute'
            guiContainer.style.top = simulationRoot === document.body
                ? '0'
                : `${Math.max(250, simulationRoot.clientHeight - 230)}px`
            guiContainer.style.right = '0'
            guiContainer.style.zIndex = '5'
            simulationRoot.appendChild(guiContainer)
            const optionsFolder = gui.addFolder('Options')
            const timer = new THREE.Timer()
            let delta
            const cannonDebugRenderer = new CannonDebugRenderer(scene, world)
            function addCannonDebugBody(body) {
                if (typeof cannonDebugRenderer.addBody === 'function') {
                    return cannonDebugRenderer.addBody(body)
                }

                const entry = {
                    body,
                    mesh: cannonDebugRenderer.createBodyMesh(body)
                }
                cannonDebugRenderer.bodies.push(entry)
                return entry
            }

            function removeCannonDebugBody(body) {
                if (typeof cannonDebugRenderer.removeBody === 'function') {
                    cannonDebugRenderer.removeBody(body)
                    return
                }

                const bodyIndex = cannonDebugRenderer.bodies.findIndex((entry) => entry.body === body)
                if (bodyIndex === -1) return
                const [{ mesh }] = cannonDebugRenderer.bodies.splice(bodyIndex, 1)
                scene.remove(mesh)
                mesh.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose()
                        child.material.dispose()
                    }
                })
            }

            for (const { body } of hiddenWheelBodies) {
                const debugBody = cannonDebugRenderer.bodies.find((entry) => entry.body === body)
                if (debugBody) debugBody.mesh.visible = false
            }
            const debugBodyVisibility = new Map(
                cannonDebugRenderer.bodies.map(({ body, mesh }) => [body, mesh.visible])
            )
            const obstacleRaycaster = new THREE.Raycaster()
            const obstaclePointer = new THREE.Vector2()
            const placedObstacles = []
            const obstaclePreview = new THREE.Mesh(
                new THREE.BoxGeometry(obstacleSize.x, obstacleSize.y, obstacleSize.z),
                new THREE.MeshPhongMaterial({
                    color: 0xf39c12,
                    transparent: true,
                    opacity: 0.5,
                    depthWrite: false
                })
            )
            obstaclePreview.castShadow = true
            obstaclePreview.visible = false
            scene.add(obstaclePreview)
            const obstacleTemplate = document.getElementById('obstacle-template')
            const obstacleMeshPreview = document.getElementById('obstacle-mesh-preview')
            const obstacleMeshPreviewContext = obstacleMeshPreview.getContext('2d')
            const obstacleSizeInputs = {
                x: document.getElementById('obstacle-size-x'),
                y: document.getElementById('obstacle-size-y'),
                z: document.getElementById('obstacle-size-z')
            }
            const obstacleSizeOutputs = {
                x: document.getElementById('obstacle-size-x-value'),
                y: document.getElementById('obstacle-size-y-value'),
                z: document.getElementById('obstacle-size-z-value')
            }

            function drawObstacleMeshPreview() {
                const context = obstacleMeshPreviewContext
                const width = obstacleMeshPreview.width
                const height = obstacleMeshPreview.height
                const { x, y, z } = obstacleSize
                const unitScale = Math.min(
                    width * 0.46 / (x + z),
                    height * 0.68 / (y + (x + z) * 0.35)
                )
                const xWidth = x * unitScale * 0.8
                const xDepth = x * unitScale * 0.35
                const zWidth = z * unitScale * 0.8
                const zDepth = z * unitScale * 0.35
                const blockHeight = y * unitScale
                const centerX = width / 2
                const bottomY = height * 0.84
                const origin = { x: centerX - xWidth / 2 + zWidth / 2, y: bottomY - (xDepth + zDepth) / 2 }
                const xCorner = { x: origin.x + xWidth, y: origin.y + xDepth }
                const zCorner = { x: origin.x - zWidth, y: origin.y + zDepth }
                const farCorner = { x: xCorner.x - zWidth, y: xCorner.y + zDepth }
                const topOrigin = { x: origin.x, y: origin.y - blockHeight }
                const topXCorner = { x: xCorner.x, y: xCorner.y - blockHeight }
                const topZCorner = { x: zCorner.x, y: zCorner.y - blockHeight }
                const topFarCorner = { x: farCorner.x, y: farCorner.y - blockHeight }

                context.clearRect(0, 0, width, height)
                context.lineWidth = 1.5
                context.strokeStyle = '#ffd28a'

                context.beginPath()
                context.moveTo(origin.x, origin.y)
                context.lineTo(zCorner.x, zCorner.y)
                context.lineTo(topZCorner.x, topZCorner.y)
                context.lineTo(topFarCorner.x, topFarCorner.y)
                context.lineTo(topXCorner.x, topXCorner.y)
                context.lineTo(xCorner.x, xCorner.y)
                context.closePath()
                context.fillStyle = '#bd690b'
                context.fill()
                context.stroke()

                context.beginPath()
                context.moveTo(origin.x, origin.y)
                context.lineTo(xCorner.x, xCorner.y)
                context.lineTo(topXCorner.x, topXCorner.y)
                context.lineTo(topOrigin.x, topOrigin.y)
                context.closePath()
                context.fillStyle = '#d98216'
                context.fill()
                context.stroke()

                context.beginPath()
                context.moveTo(origin.x, origin.y)
                context.lineTo(zCorner.x, zCorner.y)
                context.lineTo(topZCorner.x, topZCorner.y)
                context.lineTo(topOrigin.x, topOrigin.y)
                context.closePath()
                context.fillStyle = '#f39c12'
                context.fill()
                context.stroke()

                context.beginPath()
                context.moveTo(topOrigin.x, topOrigin.y)
                context.lineTo(topZCorner.x, topZCorner.y)
                context.lineTo(topFarCorner.x, topFarCorner.y)
                context.lineTo(topXCorner.x, topXCorner.y)
                context.closePath()
                context.fillStyle = '#ffc45c'
                context.fill()
                context.stroke()
            }

            function updateObstacleSize() {
                const maxSize = stairHeight * 5
                obstacleSizeInputs.x.max = String(maxSize)
                obstacleSizeInputs.y.max = String(maxSize)
                obstacleSizeInputs.z.max = String(maxSize)
                obstacleSize.set(
                    Number(obstacleSizeInputs.x.value),
                    Number(obstacleSizeInputs.y.value),
                    Number(obstacleSizeInputs.z.value)
                )
                obstacleSizeOutputs.x.value = obstacleSize.x.toFixed(2)
                obstacleSizeOutputs.y.value = obstacleSize.y.toFixed(2)
                obstacleSizeOutputs.z.value = obstacleSize.z.toFixed(2)
                obstaclePreview.geometry.dispose()
                obstaclePreview.geometry = new THREE.BoxGeometry(
                    obstacleSize.x,
                    obstacleSize.y,
                    obstacleSize.z
                )
                drawObstacleMeshPreview()
            }

            for (const input of Object.values(obstacleSizeInputs)) {
                input.addEventListener('input', updateObstacleSize)
            }
            updateObstacleSize()
            let placingObstacle = false
            let obstaclePlacementValid = false
            let deletingObstacles = false
            let obstacleDragBaseY = null
            let obstacleDragPlaneY = null
            let obstacleRotationY = 0
            const obstacleSurfaceNormalMatrix = new THREE.Matrix3()
            const placementTolerance = 1e-4

            function getObstacleBounds(x, y, z) {
                const cosine = Math.abs(Math.cos(obstacleRotationY))
                const sine = Math.abs(Math.sin(obstacleRotationY))
                const halfX = (cosine * obstacleSize.x + sine * obstacleSize.z) / 2
                const halfZ = (sine * obstacleSize.x + cosine * obstacleSize.z) / 2
                return new THREE.Box3(
                    new THREE.Vector3(x - halfX, y - obstacleSize.y / 2, z - halfZ),
                    new THREE.Vector3(x + halfX, y + obstacleSize.y / 2, z + halfZ)
                )
            }

            function updateObstaclePreview(event) {
                const rendererBounds = renderer.domElement.getBoundingClientRect()
                obstaclePointer.set(
                    ((event.clientX - rendererBounds.left) / rendererBounds.width) * 2 - 1,
                    -((event.clientY - rendererBounds.top) / rendererBounds.height) * 2 + 1
                )
                obstacleRaycaster.setFromCamera(obstaclePointer, camera)
                let point
                if (obstacleDragBaseY === null) {
                    const intersections = obstacleRaycaster.intersectObjects(obstaclePlacementSurfaces)
                    const topIntersection = intersections.find((intersection) => {
                        if (!intersection.face) return false
                        obstacleSurfaceNormalMatrix.getNormalMatrix(intersection.object.matrixWorld)
                        const normal = intersection.face.normal
                            .clone()
                            .applyMatrix3(obstacleSurfaceNormalMatrix)
                            .normalize()
                        return normal.y > 0.9
                    })
                    if (!topIntersection) {
                        obstaclePreview.visible = false
                        obstaclePlacementValid = false
                        return false
                    }
                    obstacleDragBaseY = topIntersection.point.y
                    obstacleDragPlaneY = topIntersection.point.y
                    point = topIntersection.point
                } else {
                    const dragPlane = new THREE.Plane(
                        new THREE.Vector3(0, 1, 0),
                        -obstacleDragPlaneY
                    )
                    point = obstacleRaycaster.ray.intersectPlane(dragPlane, new THREE.Vector3())
                    if (!point) {
                        obstaclePreview.visible = false
                        obstaclePlacementValid = false
                        return false
                    }
                }

                let centerY = obstacleDragBaseY + obstacleSize.y / 2
                const collisionBounds = obstacleCollisionMeshes
                    .map((mesh) => new THREE.Box3().setFromObject(mesh))
                while (obstacleDragBaseY > placementTolerance) {
                    const currentBounds = getObstacleBounds(point.x, centerY, point.z)
                    const hasSupportBelow = collisionBounds.some((bounds) => (
                        Math.abs(bounds.max.y - obstacleDragBaseY) <= placementTolerance
                        && Math.min(currentBounds.max.x, bounds.max.x)
                            - Math.max(currentBounds.min.x, bounds.min.x) > placementTolerance
                        && Math.min(currentBounds.max.z, bounds.max.z)
                            - Math.max(currentBounds.min.z, bounds.min.z) > placementTolerance
                    ))
                    if (hasSupportBelow) break

                    const lowerY = Math.max(0, obstacleDragBaseY - obstacleSize.y)
                    const lowerBounds = getObstacleBounds(point.x, lowerY + obstacleSize.y / 2, point.z)
                    const lowerSupport = collisionBounds
                        .filter((bounds) => (
                            bounds.max.y < obstacleDragBaseY - placementTolerance
                            && bounds.max.y >= lowerY - placementTolerance
                            && Math.min(lowerBounds.max.x, bounds.max.x)
                                - Math.max(lowerBounds.min.x, bounds.min.x) > placementTolerance
                            && Math.min(lowerBounds.max.z, bounds.max.z)
                                - Math.max(lowerBounds.min.z, bounds.min.z) > placementTolerance
                        ))
                        .sort((a, b) => b.max.y - a.max.y)[0]
                    obstacleDragBaseY = lowerSupport ? lowerSupport.max.y : lowerY
                    centerY = obstacleDragBaseY + obstacleSize.y / 2
                }

                let steppedUp = true
                while (steppedUp) {
                    steppedUp = false
                    const candidateBounds = getObstacleBounds(point.x, centerY, point.z)
                    const supportingTop = collisionBounds
                        .filter((bounds) => (
                            Math.min(candidateBounds.max.x, bounds.max.x)
                            - Math.max(candidateBounds.min.x, bounds.min.x)
                        ) > placementTolerance && (
                            Math.min(candidateBounds.max.z, bounds.max.z)
                            - Math.max(candidateBounds.min.z, bounds.min.z)
                        ) > placementTolerance && (
                            Math.min(candidateBounds.max.y, bounds.max.y)
                            - Math.max(candidateBounds.min.y, bounds.min.y)
                        ) > placementTolerance
                    )
                        .sort((a, b) => a.max.y - b.max.y)[0]
                    if (supportingTop) {
                        centerY = supportingTop.max.y + obstacleSize.y / 2
                        obstacleDragBaseY = supportingTop.max.y
                        steppedUp = true
                    }
                }

                obstaclePreview.position.set(point.x, centerY, point.z)
                obstaclePreview.rotation.y = obstacleRotationY
                obstaclePreview.visible = true
                const previewBounds = getObstacleBounds(point.x, centerY, point.z)
                const overlapsObstacle = collisionBounds.some((bounds) => (
                    Math.min(previewBounds.max.x, bounds.max.x)
                    - Math.max(previewBounds.min.x, bounds.min.x)
                ) > placementTolerance && (
                    Math.min(previewBounds.max.y, bounds.max.y)
                    - Math.max(previewBounds.min.y, bounds.min.y)
                ) > placementTolerance && (
                    Math.min(previewBounds.max.z, bounds.max.z)
                    - Math.max(previewBounds.min.z, bounds.min.z)
                ) > placementTolerance)
                const hasSupport = obstacleDragBaseY <= placementTolerance
                    || collisionBounds.some((bounds) => (
                        Math.abs(bounds.max.y - obstacleDragBaseY) <= placementTolerance
                        && Math.min(previewBounds.max.x, bounds.max.x)
                            - Math.max(previewBounds.min.x, bounds.min.x) > placementTolerance
                        && Math.min(previewBounds.max.z, bounds.max.z)
                            - Math.max(previewBounds.min.z, bounds.min.z) > placementTolerance
                    ))
                obstaclePlacementValid = hasSupport && !overlapsObstacle
                obstaclePreview.material.color.setHex(obstaclePlacementValid ? 0xf39c12 : 0xff3333)
                return obstaclePlacementValid
            }

            const obstacleDeleteToggle = document.getElementById('obstacle-delete-toggle')
            obstacleDeleteToggle.addEventListener('click', () => {
                deletingObstacles = !deletingObstacles
                obstacleDeleteToggle.setAttribute('aria-pressed', String(deletingObstacles))
                obstacleDeleteToggle.textContent = deletingObstacles
                    ? '삭제 모드 켜짐 (클릭하여 종료)'
                    : '설치한 직육면체 지우기'
                obstacleTemplate.disabled = deletingObstacles
                for (const input of Object.values(obstacleSizeInputs)) {
                    input.disabled = deletingObstacles
                }
                controls.enabled = !deletingObstacles
                obstaclePreview.visible = false
            })
            renderer.domElement.addEventListener('pointerdown', (event) => {
                if (!deletingObstacles || event.button !== 0) return
                event.preventDefault()
                const rendererBounds = renderer.domElement.getBoundingClientRect()
                obstaclePointer.set(
                    ((event.clientX - rendererBounds.left) / rendererBounds.width) * 2 - 1,
                    -((event.clientY - rendererBounds.top) / rendererBounds.height) * 2 + 1
                )
                obstacleRaycaster.setFromCamera(obstaclePointer, camera)
                const [intersection] = obstacleRaycaster.intersectObjects(
                    placedObstacles.map(({ mesh }) => mesh)
                )
                if (!intersection) return

                const obstacleIndex = placedObstacles.findIndex(({ mesh }) => mesh === intersection.object)
                const [{ mesh, body }] = placedObstacles.splice(obstacleIndex, 1)
                scene.remove(mesh)
                mesh.geometry.dispose()
                mesh.material.dispose()
                world.removeBody(body)
                obstacleCollisionMeshes.splice(obstacleCollisionMeshes.indexOf(mesh), 1)
                obstaclePlacementSurfaces.splice(obstaclePlacementSurfaces.indexOf(mesh), 1)
                debugBodyVisibility.delete(body)
                removeCannonDebugBody(body)
            })
            obstacleTemplate.addEventListener('pointerdown', (event) => {
                if (deletingObstacles) return
                if (event.button !== 0) return
                event.preventDefault()
                obstacleTemplate.setPointerCapture(event.pointerId)
                placingObstacle = true
                obstacleDragBaseY = null
                obstacleDragPlaneY = null
                obstacleRotationY = 0
                obstaclePreview.rotation.y = obstacleRotationY
                controls.enabled = false
                updateObstaclePreview(event)
            })
            renderer.domElement.addEventListener('wheel', (event) => {
                if (!placingObstacle) return
                event.preventDefault()
                if (event.deltaY === 0) return
                obstacleRotationY = (
                    obstacleRotationY + Math.sign(event.deltaY) * Math.PI / 2 + Math.PI * 2
                ) % (Math.PI * 2)
                obstaclePreview.rotation.y = obstacleRotationY
                updateObstaclePreview(event)
            }, { passive: false })
            window.addEventListener('pointermove', (event) => {
                if (placingObstacle) updateObstaclePreview(event)
            })
            window.addEventListener('pointerup', (event) => {
                if (!placingObstacle) return
                if (updateObstaclePreview(event)) {
                    const obstacleMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(obstacleSize.x, obstacleSize.y, obstacleSize.z),
                        new THREE.MeshPhongMaterial({ color: 0xf39c12 })
                    )
                    obstacleMesh.position.copy(obstaclePreview.position)
                    obstacleMesh.rotation.y = obstacleRotationY
                    obstacleMesh.castShadow = true
                    obstacleMesh.receiveShadow = true
                    scene.add(obstacleMesh)
                    obstaclePlacementSurfaces.push(obstacleMesh)
                    obstacleCollisionMeshes.push(obstacleMesh)

                    const obstacleBody = new CANNON.Body({ mass: 0 })
                    obstacleBody.addShape(new CANNON.Box(
                        new CANNON.Vec3(obstacleSize.x / 2, obstacleSize.y / 2, obstacleSize.z / 2)
                    ))
                    obstacleBody.position.set(
                        obstacleMesh.position.x,
                        obstacleMesh.position.y,
                        obstacleMesh.position.z
                    )
                    obstacleBody.quaternion.setFromEuler(0, obstacleRotationY, 0)
                    world.addBody(obstacleBody)
                    placedObstacles.push({ mesh: obstacleMesh, body: obstacleBody })
                    const debugBody = addCannonDebugBody(obstacleBody)
                    debugBodyVisibility.set(obstacleBody, true)
                    debugBody.mesh.visible = displaySettings.showPhysicsShapes
                }
                placingObstacle = false
                obstaclePlacementValid = false
                obstacleDragBaseY = null
                obstacleDragPlaneY = null
                obstaclePreview.visible = false
                controls.enabled = true
            })
            window.addEventListener('pointercancel', () => {
                placingObstacle = false
                obstaclePlacementValid = false
                obstacleDragBaseY = null
                obstacleDragPlaneY = null
                obstaclePreview.visible = false
                controls.enabled = true
            })
            optionsFolder
                .add(displaySettings, 'showPhysicsShapes')
                .name('물리 충돌 영역 표시')
                .onChange((visible) => {
                    for (const { body, mesh } of cannonDebugRenderer.bodies) {
                        mesh.visible = visible && debugBodyVisibility.get(body)
                    }
                })
            optionsFolder
                .add(displaySettings, 'hideBody01')
                .name('커버')
                .onChange((hidden) => setModelHidden(body01Model, hidden))
            optionsFolder
                .add(displaySettings, 'hideEle')
                .name('전자기기')
                .onChange((hidden) => setModelHidden(eleModel, hidden))
            optionsFolder
                .add(displaySettings, 'hideBat')
                .name('배터리')
                .onChange((hidden) => setModelHidden(batModel, hidden))
            optionsFolder
                .add(displaySettings, 'hideBody00')
                .name('바디')
                .onChange((hidden) => setModelHidden(body00Model, hidden))
            if (simulationRoot === document.body) {
                optionsFolder.open()
            } else {
                optionsFolder.close()
            }
            const previousCarPosition = controls.target.clone()

            document.getElementById('reset-car').addEventListener('click', () => {
                const resetBody = (body, x, y, z) => {
                    body.position.set(x, y, z)
                    body.quaternion.set(0, 0, 0, 1)
                    body.velocity.setZero()
                    body.angularVelocity.setZero()
                    body.force.setZero()
                    body.torque.setZero()
                    body.previousPosition.copy(body.position)
                    body.interpolatedPosition.copy(body.position)
                    body.previousQuaternion.copy(body.quaternion)
                    body.interpolatedQuaternion.copy(body.quaternion)
                    body.aabbNeedsUpdate = true
                    body.wakeUp()
                }

                resetBody(carBody, 0, 0.9, 0)
                resetBody(wheelLFBody, -1, wheelCenterY, -1)
                resetBody(wheelRFBody, 1, wheelCenterY, -1)
                resetBody(wheelLBBody, -1, wheelCenterY, 1)
                resetBody(wheelRBBody, 1, wheelCenterY, 1)
                resetBody(wheelUFBody, 1, 2, 1)
                resetBody(wheelUBBody, 1, 2, 1)
                for (const { body, x, z } of hiddenWheelBodies) {
                    resetBody(body, x, wheelCenterY, z)
                }
                Object.keys(keyMap).forEach((key) => {
                    keyMap[key] = false
                })
                constraintLF.setMotorSpeed(0)
                constraintRF.setMotorSpeed(0)
                constraintLB.setMotorSpeed(0)
                constraintRB.setMotorSpeed(0)
                constraintUF.setMotorSpeed(0)
                constraintUB.setMotorSpeed(0)
            })

            function animate() {
                requestAnimationFrame(animate)
                helper.update()
                delta = Math.min(timer.update().getDelta(), 0.1)
                world.step(delta)
                cannonDebugRenderer.update()
                // Copy coordinates from Cannon.js to Three.js
                carBodyMesh.position.set(carBody.position.x, carBody.position.y, carBody.position.z)
                carBodyMesh.quaternion.set(carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w)
                wheelLFMesh.position.set(wheelLFBody.position.x, wheelLFBody.position.y, wheelLFBody.position.z)
                const oledNow = performance.now()
                if (gurumiOledFaceMesh && oledNow - gurumiOledLastDraw > 45) {
                    const euler = new THREE.Euler().setFromQuaternion(carBodyMesh.quaternion, 'YXZ')
                    drawGurumiOled(oledNow, euler.x, euler.z, carBody.velocity.length())
                    gurumiOledLastDraw = oledNow
                }
                wheelLFMesh.quaternion.set(wheelLFBody.quaternion.x, wheelLFBody.quaternion.y, wheelLFBody.quaternion.z, wheelLFBody.quaternion.w)
                wheelRFMesh.position.set(wheelRFBody.position.x, wheelRFBody.position.y, wheelRFBody.position.z)
                wheelRFMesh.quaternion.set(wheelRFBody.quaternion.x, wheelRFBody.quaternion.y, wheelRFBody.quaternion.z, wheelRFBody.quaternion.w)
                wheelLBMesh.position.set(wheelLBBody.position.x, wheelLBBody.position.y, wheelLBBody.position.z)
                wheelLBMesh.quaternion.set(wheelLBBody.quaternion.x, wheelLBBody.quaternion.y, wheelLBBody.quaternion.z, wheelLBBody.quaternion.w)
                wheelRBMesh.position.set(wheelRBBody.position.x, wheelRBBody.position.y, wheelRBBody.position.z)
                wheelRBMesh.quaternion.set(wheelRBBody.quaternion.x, wheelRBBody.quaternion.y, wheelRBBody.quaternion.z, wheelRBBody.quaternion.w)
                wheelUFMesh.position.set(wheelUFBody.position.x, wheelUFBody.position.y, wheelUFBody.position.z)
                wheelUFMesh.quaternion.set(wheelUFBody.quaternion.x, wheelUFBody.quaternion.y, wheelUFBody.quaternion.z, wheelUFBody.quaternion.w)
                wheelUBMesh.position.set(wheelUBBody.position.x, wheelUBBody.position.y, wheelUBBody.position.z)
                wheelUBMesh.quaternion.set(wheelUBBody.quaternion.x, wheelUBBody.quaternion.y, wheelUBBody.quaternion.z, wheelUBBody.quaternion.w)
                for (const { body, mesh } of hiddenWheelBodies) {
                    mesh.position.set(body.position.x, body.position.y, body.position.z)
                    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
                }
                const forwardPressed = keyMap['KeyW'] || keyMap['ArrowUp']
                const reversePressed = keyMap['KeyS'] || keyMap['ArrowDown']
                const keyboardDrive = forwardPressed === reversePressed ? 0 : forwardPressed ? 1 : -1
                const phoneControl = window.gurumiPhoneControl
                const driveDirection = keyboardDrive !== 0
                    ? keyboardDrive
                    : (joystickSettings.pointerId !== null
                        ? joystickSettings.drive
                        : (phoneControl ? phoneControl.drive : 0))
                const keyboardTurn = (keyMap['KeyA'] || keyMap['ArrowLeft'] ? 1 : 0)
                    - (keyMap['KeyD'] || keyMap['ArrowRight'] ? 1 : 0)
                const turnDirection = joystickSettings.pointerId === null
                    ? keyboardTurn
                    : -joystickSettings.turn
                const phoneDriveActive = phoneControl
                    && keyboardDrive === 0
                    && joystickSettings.pointerId === null
                    && keyboardTurn === 0
                    && phoneControl.drive !== 0
                let leftDrive = driveDirection - turnDirection * 0.7
                let rightDrive = driveDirection + turnDirection * 0.7
                if (phoneDriveActive) {
                    const boundedPitch = Math.max(-90, Math.min(90, phoneControl.pitch))
                    if (boundedPitch < 0) {
                        leftDrive = phoneControl.drive * (1 + boundedPitch / 45)
                        rightDrive = phoneControl.drive
                    } else {
                        leftDrive = phoneControl.drive
                        rightDrive = phoneControl.drive * (1 - boundedPitch / 45)
                    }
                }
                const speedScale = Math.max(1, Math.abs(leftDrive), Math.abs(rightDrive))
                const stopPressed = keyMap['Space']
                const blockControlled = window.gurumi && window.gurumi.isBlockControlled
                const leftMotorSpeed = stopPressed ? 0 : blockControlled
                    ? window.gurumi.leftSpeed
                    : leftDrive / speedScale * DRIVE_SPEED
                const rightMotorSpeed = stopPressed ? 0 : blockControlled
                    ? window.gurumi.rightSpeed
                    : rightDrive / speedScale * DRIVE_SPEED

                if (leftMotorSpeed === 0 && rightMotorSpeed === 0) {
                    for (const body of carBodies) {
                        body.velocity.setZero()
                        body.angularVelocity.setZero()
                    }
                }
                constraintLF.setMotorSpeed(leftMotorSpeed)
                constraintLB.setMotorSpeed(leftMotorSpeed)
                constraintRF.setMotorSpeed(rightMotorSpeed)
                constraintRB.setMotorSpeed(rightMotorSpeed)
                constraintUF.setMotorSpeed(-rightMotorSpeed)
                constraintUB.setMotorSpeed(-leftMotorSpeed)
                for (const { constraint, x } of hiddenWheelConstraints) {
                    constraint.setMotorSpeed(x < 0 ? leftMotorSpeed : rightMotorSpeed)
                }
                const followOffset = carBodyMesh.position.clone().sub(previousCarPosition)
                camera.position.add(followOffset)
                controls.target.add(followOffset)
                previousCarPosition.copy(carBodyMesh.position)
                applyPhoneOrbit()
                controls.update()
                render()
                //stats.update()
            }
            function render() {
                const previewBounds = cameraPreview.getBoundingClientRect()
                const rendererBounds = renderer.domElement.getBoundingClientRect()
                const previewWidth = previewBounds.width
                const previewHeight = previewBounds.height
                const previewX = previewBounds.left - rendererBounds.left
                const previewY = previewBounds.top - rendererBounds.top
                const renderWidth = rendererBounds.width
                const renderHeight = rendererBounds.height
                onboardCamera.aspect = previewWidth / previewHeight
                onboardCamera.updateProjectionMatrix()
                onboardCamera.updateMatrixWorld(true)
                onboardCameraHelper.update()
                renderer.render(scene, camera)
                renderer.setViewport(
                    previewX,
                    renderHeight - previewY - previewHeight,
                    previewWidth,
                    previewHeight
                )
                renderer.setScissor(
                    previewX,
                    renderHeight - previewY - previewHeight,
                    previewWidth,
                    previewHeight
                )
                renderer.setScissorTest(true)
                renderer.clearDepth()
                const sceneBackground = scene.background
                const shadowsEnabled = renderer.shadowMap.enabled
                const cameraHelperVisible = onboardCameraHelper.visible
                const shadowReceivingMeshes = []
                scene.traverseVisible((object) => {
                    if (object.isMesh && object.receiveShadow) {
                        object.receiveShadow = false
                        shadowReceivingMeshes.push(object)
                    }
                })
                scene.background = cameraPreviewBackground
                renderer.shadowMap.enabled = false
                onboardCameraHelper.visible = false
                cameraPreviewFillLight.visible = true
                renderer.render(scene, onboardCamera)
                cameraPreviewFillLight.visible = false
                onboardCameraHelper.visible = cameraHelperVisible
                renderer.shadowMap.enabled = shadowsEnabled
                for (const mesh of shadowReceivingMeshes) {
                    mesh.receiveShadow = true
                }
                scene.background = sceneBackground
                renderer.setScissorTest(false)
                renderer.setViewport(0, 0, renderWidth, renderHeight)
                const pixelRatioX = renderer.domElement.width / rendererBounds.width
                const pixelRatioY = renderer.domElement.height / rendererBounds.height
                const canvasWidth = Math.round(previewWidth * pixelRatioX)
                const canvasHeight = Math.round(previewHeight * pixelRatioY)
                if (cameraPreviewCanvas.width !== canvasWidth || cameraPreviewCanvas.height !== canvasHeight) {
                    cameraPreviewCanvas.width = canvasWidth
                    cameraPreviewCanvas.height = canvasHeight
                }
                cameraPreviewContext.drawImage(
                    renderer.domElement,
                    previewX * pixelRatioX,
                    previewY * pixelRatioY,
                    previewWidth * pixelRatioX,
                    previewHeight * pixelRatioY,
                    0,
                    0,
                    canvasWidth,
                    canvasHeight
                )
            }
            animate()
            window.focus()
