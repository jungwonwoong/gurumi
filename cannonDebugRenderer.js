import * as CANNON from 'cannon-es'
import * as THREE from 'three'

export default class CannonDebugRenderer {
    constructor(scene, world) {
        this.scene = scene
        this.bodies = world.bodies.map((body) => ({
            body,
            mesh: this.createBodyMesh(body),
        }))
    }

    createBodyMesh(body) {
        const bodyMesh = new THREE.Group()

        body.shapes.forEach((shape, index) => {
            let geometry
            if (shape instanceof CANNON.Box) {
                geometry = new THREE.BoxGeometry(
                    shape.halfExtents.x * 2,
                    shape.halfExtents.y * 2,
                    shape.halfExtents.z * 2
                )
            } else if (shape instanceof CANNON.Sphere) {
                geometry = new THREE.SphereGeometry(shape.radius, 12, 8)
            } else if (shape instanceof CANNON.Cylinder) {
                geometry = new THREE.CylinderGeometry(
                    shape.radiusTop,
                    shape.radiusBottom,
                    shape.height,
                    shape.numSegments
                )
            } else {
                throw new Error(`Unsupported Cannon.js debug shape: ${shape.constructor.name}`)
            }

            const mesh = new THREE.Mesh(
                geometry,
                new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    wireframe: true,
                })
            )
            mesh.position.copy(body.shapeOffsets[index])
            mesh.quaternion.copy(body.shapeOrientations[index])
            bodyMesh.add(mesh)
        })

        this.scene.add(bodyMesh)
        return bodyMesh
    }

    update() {
        for (const { body, mesh } of this.bodies) {
            mesh.position.copy(body.position)
            mesh.quaternion.copy(body.quaternion)
        }
    }
}
