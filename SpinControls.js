/**
 * @author Paul Elliott / http://vizworkshop.com
 */

var SpinControls = function ( object, trackBallRadius, camera, domElement ) {

	var _this = this;

	this.object = object;
	this.camera = camera;
	this.domElement = ( domElement !== undefined ) ? domElement : document;
	this.trackballRadius = trackBallRadius;

	// API

	this.enabled = true;

	this.screen = { left: 0, top: 0, width: 0, height: 0 };

	this.rotateSensativity = 1.0;
	this.staticMoving = false;
	this.dampingFactor = 0.1;

	// internals

	var _angularVelocity = new THREE.Vector3(0, 0, 0),
		_lastQuaternion = new THREE.Quaternion(),

		_mousePrev = new THREE.Vector2(),
		_mouseCurr = new THREE.Vector2(),

		// Seperate touch variables as might be mouseing and touching at same time on laptop?
		_touchPrev = new THREE.Vector2(),
		_touchCurr = new THREE.Vector2(),

		_moveDelta = new THREE.Vector2(),

		_isPointerDown = false,

		_ray = new THREE.Ray(),
		_trackBallSphere = new THREE.Sphere(),

		_EPS = 0.000001;


	var changeEvent = { type: 'change' };
	var startEvent = { type: 'start' };
	var endEvent = { type: 'end' };

	this.update = ( function () {

		return function update() {

			if( !_isPointerDown && !_this.staticMoving ) {

				_angularVelocity.multiplyScalar( ( 1.0 - _this.dampingFactor ) );

				_this.applyVelocity();

			}

		};

	}() );


	this.updateAngularVelocity = ( function () {

		var moveDelta = new THREE.Vector2(),
			quaternion = new THREE.Quaternion(),
			objectWorldPos = new THREE.Vector3(),
			objectToCamera = new THREE.Vector3(),
			objectPlane = new THREE.Plane(),

			currentInputDirection = new THREE.Vector3(),
			lastInputDirection = new THREE.Vector3(),
			currentInputPos = new THREE.Vector3(),
			lastInputPos = new THREE.Vector3(),

			lastTime,
			deltaTime,
			timeStamp,
			trackballRadius,
			angle;

		return function updateAngularVelocity( currentNdc, lastNdc ) {
			timeStamp = performance.now();
			deltaTime = ( timeStamp - lastTime ) / 1000.0;
			lastTime = timeStamp;

			// Intersect mouse on plane at object with normal pointing to camera

			objectWorldPos.setFromMatrixPosition( _this.object.matrixWorld );
			objectToCamera.copy( _this.camera.position ).sub( objectWorldPos );
			objectPlane.setFromNormalAndCoplanarPoint( objectToCamera, objectWorldPos );

			_ray.origin.copy( _this.camera.position );

			currentInputDirection.set( currentNdc.x, currentNdc.y, .5 )
			currentInputDirection.unproject( _this.camera ) // In world space
			currentInputDirection.sub( _this.camera.position ).normalize() // Subtract to put around origin
			_ray.direction.copy( currentInputDirection )

			if( _ray.intersectPlane( objectPlane, currentInputPos ) == null ) {

				return; // We could be facing 180 degrees away

			}

			// Recalculate lastInputDirection because touch and mouse pointers may act at same time
			lastInputDirection.set( lastNdc.x, lastNdc.y, .5 );
			lastInputDirection.unproject( _this.camera );
			lastInputDirection.sub( _this.camera.position ).normalize();
			_ray.direction.copy( lastInputDirection );

			if( _ray.intersectPlane( objectPlane, lastInputPos ) == null ) {

				return;

			}

			//ToDo: Replace below with normalized rotation when pointer further than radius

			// Put in object position space to find trackball radius
			currentInputPos.sub( objectWorldPos );
			lastInputPos.sub( objectWorldPos );
			// Trackball radius fits both points, but does not shrink so much that you are always acting on edge
			trackballRadius = Math.max( currentInputPos.length(), lastInputPos.length(), _this.trackballRadius );

			_trackBallSphere.set( objectWorldPos, trackballRadius);

			// Project mouse on trackball sphere

			if( trackballRadius <= objectToCamera.length()  ) { // If trackball smaller than camera distance

				_ray.direction.copy( currentInputDirection );

				if( _ray.intersectSphere( _trackBallSphere, currentInputPos ) == null ) {

					return;

				}

				_ray.direction.copy( lastInputDirection );

				if( _ray.intersectSphere( _trackBallSphere, lastInputPos ) == null ) {

					return;

				}

				// Put in object position space
				currentInputPos.sub( objectWorldPos );
				lastInputPos.sub( objectWorldPos );

			}

			angle = lastInputPos.angleTo( currentInputPos ) * _this.rotateSensativity / deltaTime;

			// Change in angular vel
			_angularVelocity.crossVectors( lastInputPos, currentInputPos );
			_angularVelocity.setLength( angle ); // Just set it because we are touching trackball without sliding

			_this.applyVelocity();
		};

	}() );


	this.applyVelocity = ( function () {

		var quat = new THREE.Quaternion(),
			normalizedAxis = new THREE.Vector3(),
			deltaAngle,
			deltaTime,
			lastTime,
			timeStamp;

		return function applyVelocity() {

			timeStamp = performance.now();
			deltaTime = ( timeStamp - lastTime ) / 1000.0;
			lastTime = timeStamp;
			deltaAngle = _angularVelocity.length();
			if ( deltaAngle && deltaTime ) {
				normalizedAxis.copy( _angularVelocity );
				normalizedAxis.normalize();
				quat.setFromAxisAngle( normalizedAxis, deltaAngle * deltaTime );

				_this.object.quaternion.normalize();
				_this.object.quaternion.premultiply(quat);

				// using small-angle approximation cos(x/2) = 1 - x^2 / 8

				if ( 8 * ( 1 - _lastQuaternion.dot( _this.object.quaternion ) ) > _this._EPS) {

					_this.dispatchEvent( changeEvent );

					_lastQuaternion.copy( _this.object.quaternion );

				}

			}

		};

	}() );

	this.isHittingObject = ( function () {

		var currentInputDirection = new THREE.Vector3(),
			objectWorldPos = new THREE.Vector3();

		return function isHittingObject( pointerNDC ) {

			currentInputDirection.set( pointerNDC.x, pointerNDC.y, .5 )
			currentInputDirection.unproject( _this.camera ) //in world space
			currentInputDirection.sub( _this.camera.position ).normalize() //sub to put around origin
			_ray.direction.copy( currentInputDirection )
			_ray.origin.copy( _this.camera.position );

			objectWorldPos.setFromMatrixPosition( _this.object.matrixWorld );
			_trackBallSphere.set( objectWorldPos, this.trackballRadius);

			if( _ray.intersectSphere( _trackBallSphere, objectWorldPos ) == null ) {

				return false;

			}
			else {

				return true;

			}

		}

	}() );


	this.onWindowResize = ( function () {

		if ( _this.domElement === document ) {

			_this.screen.left = 0;
			_this.screen.top = 0;
			_this.screen.width = window.innerWidth;
			_this.screen.height = window.innerHeight;

		} else {

			var box = _this.domElement.getBoundingClientRect();
			// adjustments come from similar code in the jquery offset() function
			var d = _this.domElement.ownerDocument.documentElement;
			_this.screen.left = box.left + window.pageXOffset - d.clientLeft;
			_this.screen.top = box.top + window.pageYOffset - d.clientTop;
			_this.screen.width = box.width;
			_this.screen.height = box.height;

		}

	} );

	var getPointerInNdc = ( function () {

		var vector = new THREE.Vector2();

		return function getPointerInNdc( pageX, pageY ) {

			vector.set(
				( ( pageX - _this.screen.width * 0.5 - _this.screen.left ) / ( _this.screen.width * 0.5 ) ),
				( ( _this.screen.height + 2 * ( _this.screen.top - pageY ) ) / _this.screen.height ) // screen.height intentional =)
			);

			return vector;

		};

	}() );

	function startPointerSpinning() {

	}

	// listeners

	function onMouseDown( event ) {

		if ( _this.enabled === false || event.button !== 0) return;

		var pointerNDC = getPointerInNdc( event.pageX, event.pageY );
		if( _this.isHittingObject( pointerNDC ) ) {

			event.preventDefault(); // Prevent the browser from scrolling.
			event.stopImmediatePropagation(); //Prevent other controls from working.

			// Manually set the focus since calling preventDefault above
			// prevents the browser from setting it automatically.
			_this.domElement.focus ? _this.domElement.focus() : window.focus();

			_mouseCurr.copy( pointerNDC );
			_angularVelocity.set( 0, 0, 0 );
			_isPointerDown = true;

			document.addEventListener( 'mousemove', onMouseMove, false );
			document.addEventListener( 'mouseup', onMouseUp, false );

			_this.dispatchEvent( startEvent );

		}

	}

	function onMouseMove( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();

		_mousePrev.copy( _mouseCurr );
		_mouseCurr.copy( getPointerInNdc( event.pageX, event.pageY ) );

		_this.updateAngularVelocity( _mouseCurr, _mousePrev );

	}

	function onMouseUp( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();

		_isPointerDown = false;

		document.removeEventListener( 'mousemove', onMouseMove );
		document.removeEventListener( 'mouseup', onMouseUp );
		_this.dispatchEvent( endEvent );

	}

	function touchstart( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopImmediatePropagation();

		_touchCurr.copy( getPointerInNdc( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
		_angularVelocity.set( 0, 0, 0 );
		_isPointerDown = true;

		_this.dispatchEvent( startEvent );

	}

	function touchmove( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();

		_touchPrev.copy( _touchCurr );
		_touchCurr.copy( getPointerInNdc( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );

		_this.updateAngularVelocity( _touchCurr, _touchPrev );

	}

	function touchend( event ) {

		if ( _this.enabled === false ) return;

		_isPointerDown = false;

		_this.dispatchEvent( endEvent );

	}

	this.dispose = function () {

		this.domElement.removeEventListener( 'resize', onWindowResize, false );
		this.domElement.removeEventListener( 'mousedown', onMouseDown, false );

		this.domElement.removeEventListener( 'touchstart', touchstart, false );
		this.domElement.removeEventListener( 'touchend', touchend, false );
		this.domElement.removeEventListener( 'touchmove', touchmove, false );

		this.domElement.removeEventListener( 'mousemove', onMouseMove, false );
		this.domElement.removeEventListener( 'mouseup', onMouseUp, false );

	};


	this.domElement.addEventListener( 'resize', onWindowResize, false );
	this.domElement.addEventListener( 'mousedown', onMouseDown, false );

	this.domElement.addEventListener( 'touchstart', touchstart, false );
	this.domElement.addEventListener( 'touchend', touchend, false );
	this.domElement.addEventListener( 'touchmove', touchmove, false );



	_this.onWindowResize();
	// force an update at start
	this.update();

};

SpinControls.prototype = Object.create( THREE.EventDispatcher.prototype );
SpinControls.prototype.constructor = SpinControls;