import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function disposeObjects(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    }
  });
}

export default function ModelViewer({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError('WebGL is unavailable. Download the model to view it locally.');
      return;
    }
    const container = host.current;
    let disposed = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D model. Drag to orbit and scroll to zoom.',
    );
    renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    camera.position.set(4, 3, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4d6255, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    controls.addEventListener('change', render);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (!url.startsWith('blob:') && !url.startsWith('data:'))
        throw new Error('External model resources are blocked. Export a self-contained GLB.');
      return url;
    });
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const loader = new GLTFLoader(manager);
    loader.parse(
      bytes.slice().buffer,
      '',
      (gltf) => {
        if (disposed) {
          disposeObjects(gltf.scene);
          return;
        }
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        gltf.scene.position.sub(center);
        scene.add(gltf.scene);
        const scale = Math.max(size.x, size.y, size.z) || 1;
        resize();
        // Fit the projected bounds to this viewport, including wide canvas cards.
        // A distance based only on the largest model dimension wastes most of
        // the viewport for long, thin engineering structures.
        const direction = new THREE.Vector3(1.3, 0.8, 1.5).normalize();
        camera.position.copy(direction);
        camera.lookAt(0, 0, 0);
        const inverseView = camera.quaternion.clone().invert();
        const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = scale / 100;
        for (const x of [-0.5, 0.5])
          for (const y of [-0.5, 0.5])
            for (const z of [-0.5, 0.5]) {
              const corner = new THREE.Vector3(size.x * x, size.y * y, size.z * z).applyQuaternion(
                inverseView,
              );
              distance = Math.max(
                distance,
                Math.abs(corner.x) / (tangent * camera.aspect) + corner.z,
                Math.abs(corner.y) / tangent + corner.z,
              );
            }
        camera.position.copy(direction.multiplyScalar(distance * 1.18));
        camera.near = scale / 100;
        camera.far = scale * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
        resize();
      },
      (e) => setError(e instanceof Error ? e.message : 'This model could not be loaded.'),
    );
    return () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      disposeObjects(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [bytes]);
  return (
    <div className="model-wrap">
      <div className="model-viewport" ref={host} />
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="viewer-hint">
          Drag to orbit <span>·</span> Scroll to zoom
        </div>
      )}
    </div>
  );
}
