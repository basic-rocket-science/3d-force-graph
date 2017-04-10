import './3d-force-graph.css';

import * as THREE from 'three';
window.THREE = THREE;

import 'three/examples/js/controls/TrackBallControls';
import 'three/examples/js/controls/VRControls';
import 'three/examples/js/effects/VREffect';
import 'three-firstperson-vr-controls';
import { default as ThreeText2D } from 'three-text-2d';
THREE.Text2D = ThreeText2D;
//import './TouchpadMovementControls';

window.WebVRConfig = { BUFFER_SCALE: 0.5 };
import 'webvr-polyfill';
import { default as webvrui } from 'webvr-ui';

import graph from 'ngraph.graph';
import forcelayout3d from 'ngraph.forcelayout3d';
const ngraph = { graph, forcelayout3d };

export default function() {

	const CAMERA_DISTANCE2NODES_FACTOR = 150;

	class CompProp {
		constructor(name, initVal = null, redigest = true, onChange = newVal => {}) {
			this.name = name;
			this.initVal = initVal;
			this.redigest = redigest;
			this.onChange = onChange;
		}
	}

	const env = { // Holds component state
		initialised: false,
		onFrame: () => {}
	};

	const exposeProps = [
		new CompProp('width', window.innerWidth),
		new CompProp('height', window.innerHeight),
		new CompProp('graphData', {
			nodes: { 1: { name: 'mock', val: 1 } },
			links: [[1, 1]] // [from, to]
		}),
		new CompProp('nodeRelSize', 4), // volume per val unit
		new CompProp('lineOpacity', 0.2),
		new CompProp('valAccessor', node => node.val),
		new CompProp('nameAccessor', node => node.name),
		new CompProp('colorAccessor', node => node.color),
		new CompProp('warmUpTicks', 0), // how many times to tick the force engine at init before starting to render
		new CompProp('coolDownTicks', Infinity),
		new CompProp('coolDownTime', 15000) // ms
	];

	function initStatic() {
		// Wipe DOM
		env.domNode.innerHTML = '';

		// Add nav info section
		const navInfo = document.createElement('div');
		navInfo.classList.add('graph-nav-info');
		navInfo.innerHTML = "MOVE mouse &amp; press LEFT/A: rotate, MIDDLE/S: zoom, RIGHT/D: pan";
		env.domNode.appendChild(navInfo);

		// Setup html tooltip
		env.toolTipElem = document.createElement('div');
		env.toolTipElem.classList.add('graph-tooltip');
		env.domNode.appendChild(env.toolTipElem);

		// Setup sprite tooltip
		env.toolTipSprite = new THREE.Text2D.SpriteText2D('', { fillStyle: 'lavender' });

		// Capture mouse coords on move
		env.raycaster = new THREE.Raycaster();
		env.mouse = new THREE.Vector2();
		env.mouse.x = -2; // Initialize off canvas
		env.mouse.y = -2;
		env.domNode.addEventListener("mousemove", ev => {
			// update the mouse pos
			const offset = getOffset(env.domNode),
				relPos = {
					x: ev.pageX - offset.left,
					y: ev.pageY - offset.top
				};
			env.mouse.x = (relPos.x / env.width) * 2 - 1;
			env.mouse.y = -(relPos.y / env.height) * 2 + 1;

			// Move tooltip
			env.toolTipElem.style.top = (relPos.y - 40) + 'px';
			env.toolTipElem.style.left = (relPos.x - 20) + 'px';

			function getOffset(el) {
				const rect = el.getBoundingClientRect(),
					scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
					scrollTop = window.pageYOffset || document.documentElement.scrollTop;
				return { top: rect.top + scrollTop, left: rect.left + scrollLeft };
			}
		}, false);

		// Setup camera
		env.camera = new THREE.PerspectiveCamera();
		env.camera.far = 20000;
		env.camera.position.z = 1000;

		// Setup scene
		env.scene = new THREE.Scene();

		// Setup renderer
		env.renderer = new THREE.WebGLRenderer();
		env.domNode.appendChild(env.renderer.domElement);

		// Add camera interactions
		env.tbcontrols = new TrackballControls(env.camera, env.renderer.domElement);
		env.vrcontrols = new THREE.VRControls(env.camera);

		//env.fpVrControls = new THREE.FirstPersonVRControls(env.camera);
		//env.fpVrControls.verticalMovement = true;
		//env.fpVrControls.movementSpeed = 75;

		//env.touchMoveControls = new THREE.TouchpadMovementControls(env.camera, env.renderer.domElement);
		//env.touchMoveControls.movementSpeed = 75;

		initWebVR();

		env.initialised = true;

		//

		// Kick-off renderer
		(function animate() { // IIFE
			env.onFrame();

			// Update tooltip
			env.raycaster.setFromCamera(env.mouse, env.camera);
			const intersects = env.raycaster.intersectObjects(env.scene.children).filter(o => o.object.type !== 'Sprite');
			const firstObj = intersects.length ? intersects[0].object : null;
			env.toolTipElem.innerHTML = firstObj ? firstObj.name || '' : '';

			if (env.vrButton.isPresenting()) {
				// Show sprite label
				env.toolTipSprite.text = firstObj ? firstObj.name || '' : '';
				if (firstObj) { env.toolTipSprite.position.copy(firstObj.position); }
			}

			// Update controls
			env.tbcontrols.update();
			env.vrcontrols.update();
			//env.fpVrControls.update(timestamp);
			//if (env.vrButton.isPresenting()) {
			//	env.touchMoveControls.update(timestamp);
			//}

			// Frame cycle
			// WebGL rendering
			//env.renderer.render(env.scene, env.camera);
			//requestAnimationFrame(animate);

			// WebVR rendering
			env.vreffect.render(env.scene, env.camera);
			env.vrDisplay.requestAnimationFrame(animate);
		})();

		//

		function initWebVR() {
			// Apply VR stereo rendering to renderer.
			env.vreffect = new THREE.VREffect(env.renderer);


			// Initialize the WebVR UI.
			const webvruiElem = document.createElement('div');
			webvruiElem.setIdAttribute('ui');
			env.domNode.appendChild(webvruiElem);

			const vrButton = document.createElement('div');
			vrButton.setIdAttribute('vr-button');
			webvruiElem.appendChild(vrButton);

			const magicWindow = document.createElement('a');
			magicWindow.setIdAttribute('magic-window');
			magicWindow.innerHTML = 'Try it without a headset';
			webvruiElem.appendChild(magicWindow);

			env.vrButton = new webvrui.EnterVRButton(env.renderer.domElement, {
				color: 'black',
				background: 'white',
				corners: 'square'
			});

			env.vrButton.on('exit', () => {
				env.camera.quaternion.set(0, 0, 0, 1);
				//env.camera.position.set(0, env.vrcontrols.userHeight, 0);
				env.camera.position.set(0, 0, 0);
				//env.touchMoveControls.moveForward = 0;
			});
			env.vrButton.on('enter', () => {
				env.camera.quaternion.set(0, 0, 0, 1);
				env.camera.position.set(0, 0, 0);
				//env.touchMoveControls.moveForward = 0;
			});
			env.vrButton.on('hide', () => {
				document.getElementById('ui').style.display = 'none';
			});
			env.vrButton.on('show', () => {
				document.getElementById('ui').style.display = 'inherit';
			});

			document.getElementById('vr-button').appendChild(env.vrButton.domElement);
			document.getElementById('magic-window').addEventListener('click', () => {
				env.vrButton.requestEnterFullscreen();
			});

			//

			navigator.getVRDisplays().then(displays => {
				if (displays.length > 0) {
					env.vrDisplay = displays[0];
					env.vrDisplay.requestAnimationFrame(animate);
				}
			});
		}
	}

	function digest() {
		if (!env.initialised) { return }

		resizeCanvas();

		env.onFrame = ()=>{}; // Clear previous frame hook
		env.scene = new THREE.Scene(); // Clear the place

		// Add tooltip sprite
		env.scene.add(env.toolTipSprite);

		// Build graph with data
		const graph = ngraph.graph();
		for (let nodeId in env.graphData.nodes) {
			graph.addNode(nodeId, env.graphData.nodes[nodeId]);
		}
		for (let link of env.graphData.links) {
			graph.addLink(...link, {});
		}

		// Add WebGL objects
		graph.forEachNode(node => {
			const nodeMaterial = new THREE.MeshBasicMaterial({ color: env.colorAccessor(node.data) || 0xffffaa, transparent: true });
			nodeMaterial.opacity = 0.75;

			const sphere = new THREE.Mesh(
				new THREE.SphereGeometry(Math.cbrt(env.valAccessor(node.data) || 1) * env.nodeRelSize),
				nodeMaterial
			);
			sphere.name = env.nameAccessor(node.data) || '';

			env.scene.add(node.data.sphere = sphere)
		});

		const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true });
		lineMaterial.opacity = env.lineOpacity;
		graph.forEachLink(link => {
			const line = new THREE.Line(new THREE.Geometry(), lineMaterial),
				fromName = getNodeName(link.fromId),
				toName = getNodeName(link.toId);
			if (fromName && toName) { line.name = `${fromName} > ${toName}`; }

			env.scene.add(link.data.line = line)

			function getNodeName(nodeId) {
				return env.nameAccessor(graph.getNode(nodeId).data);
			}
		});

		env.camera.lookAt(env.scene.position);
		env.camera.position.z = Math.cbrt(Object.keys(env.graphData.nodes).length) * CAMERA_DISTANCE2NODES_FACTOR;

		// Add force-directed layout
		const layout = ngraph.forcelayout3d(graph);

		for (let i=0; i<env.warmUpTicks; i++) { layout.step(); } // Initial ticks before starting to render

		let cntTicks = 0;
		const startTickTime = new Date();
		env.onFrame = layoutTick;

		//

		function resizeCanvas() {
			if (env.width && env.height) {
				//env.renderer.setSize(env.width, env.height);
				env.vreffect.setSize(env.width, env.height);

				env.camera.aspect = env.width/env.height;
				env.camera.updateProjectionMatrix();
			}
		}

		function layoutTick() {
			if (cntTicks++ > env.coolDownTicks || (new Date()) - startTickTime > env.coolDownTime) {
				env.onFrame = ()=>{}; // Stop ticking graph
			}

			layout.step(); // Tick it

			// Update nodes position
			graph.forEachNode(node => {
				const sphere = node.data.sphere,
					pos = layout.getNodePosition(node.id);

				sphere.position.x = pos.x;
				sphere.position.y = pos.y;
				sphere.position.z = pos.z;
			});

			// Update links position
			graph.forEachLink(link => {
				const line = link.data.line,
					pos = layout.getLinkPosition(link.id);

				line.geometry.vertices = [
					new THREE.Vector3(pos.from.x, pos.from.y, pos.from.z),
					new THREE.Vector3(pos.to.x, pos.to.y, pos.to.z)
				];

				line.geometry.verticesNeedUpdate = true;
				line.geometry.computeBoundingSphere();
			});
		}
	}

	// Component constructor
	function chart(nodeElement) {
		env.domNode = nodeElement;

		initStatic();
		digest();

		return chart;
	}

	// Getter/setter methods
	exposeProps.forEach(prop => {
		chart[prop.name] = getSetEnv(prop.name, prop.redigest, prop.onChange);
		env[prop.name] = prop.initVal;
		prop.onChange(prop.initVal);

		function getSetEnv(prop, redigest = false,  onChange = newVal => {}) {
			return _ => {
				if (!arguments.length) { return env[prop] }
				env[prop] = _;
				onChange(_);
				if (redigest) { digest() }
				return chart;
			}
		}
	});

	// Reset to default state
	chart.resetState = function() {
		this.graphData({nodes: [], links: []})
			.nodeRelSize(4)
			.lineOpacity(0.2)
			.valAccessor(node => node.val)
			.nameAccessor(node => node.name)
			.colorAccessor(node => node.color)
			.warmUpTicks(0)
			.coolDownTicks(Infinity)
			.coolDownTime(15000); // ms

		return this;
	};

	chart.resetState(); // Set defaults at instantiation

	return chart;
};
