/* ==========================================================================
   hero-scene.js — صحنه‌ی سه‌بعدی صفحه‌ی اول

   ترکیبی از چند المان مستقل، نه یک شیء واحد:

     ۱. حلقه‌ی نور (رینگ‌لایت)  — نماد استودیوی زیبایی
     ۲. قطره‌های شیشه‌ای شناور  — سبکی و ظرافت
     ۳. کریستال‌های رزگلد       — چرخش آرام، برق فلزی
     ۴. کمان‌های نازک طلایی     — قاب‌بندی ظریف
     ۵. گرد نور (bokeh)         — عمق فضایی

   چیدمان: همه روی یک «مدار» نامرئی می‌چرخند، با سرعت‌های متفاوت.
   هیچ فرم آناتومیکی وجود ندارد، پس حس ناخوشایند نمی‌دهد.

   بهینه‌سازی: کیفیت تطبیقی، ادغام هندسه، توقف رندر خارج از دید،
   سقف پیکسل، احترام به prefers-reduced-motion.
   ========================================================================== */
(function (global) {
  'use strict';

  var ZZ = (global.ZZ = global.ZZ || {});

  /* ---------------- پروفایل دستگاه ---------------- */
  function deviceProfile() {
    var w = global.innerWidth;
    var mobile = w < 720;
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    var cores = global.navigator.hardwareConcurrency || 4;
    var lowEnd = mobile || cores <= 4;

    return {
      mobile: mobile,
      coarse: coarse,
      lowEnd: lowEnd,
      dpr: Math.min(global.devicePixelRatio || 1, mobile ? 1.5 : (w > 1600 ? 1.35 : 1.65)),
      maxPixels: lowEnd ? 850000 : 1800000,

      ringSeg: lowEnd ? [80, 8] : [140, 12],   // [tubular, radial]
      dropSeg: lowEnd ? [16, 12] : [28, 20],
      drops: lowEnd ? 4 : 6,
      crystals: lowEnd ? 3 : 5,
      arcs: lowEnd ? 2 : 3,
      bokeh: lowEnd ? 16 : 30,
      antialias: !lowEnd
    };
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(global.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------------- بافت‌ها ---------------- */

  function makeGlowTexture(THREE) {
    var s = 64;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0.00, 'rgba(255,247,238,0.95)');
    grad.addColorStop(0.28, 'rgba(236,196,168,0.55)');
    grad.addColorStop(1.00, 'rgba(236,196,168,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  /** محیط استودیویی — روی سطوح فلزی و شیشه‌ای منعکس می‌شود */
  function makeEnvTexture(THREE) {
    var w = 256, h = 128;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');

    var base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0.00, '#FFF8F0');
    base.addColorStop(0.26, '#FBE7D6');
    base.addColorStop(0.54, '#E0AE90');
    base.addColorStop(0.80, '#A9603F');
    base.addColorStop(1.00, '#5A2F20');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    /* softbox اصلی بالا-راست */
    var key = g.createRadialGradient(w * 0.68, h * 0.14, 0, w * 0.68, h * 0.14, h * 0.68);
    key.addColorStop(0.0, 'rgba(255,255,255,1)');
    key.addColorStop(0.42, 'rgba(255,248,240,0.5)');
    key.addColorStop(1.0, 'rgba(255,248,240,0)');
    g.fillStyle = key;
    g.fillRect(0, 0, w, h);

    /* fill سرد از چپ — تفکیک رنگی سایه‌ها */
    var fill = g.createRadialGradient(w * 0.15, h * 0.40, 0, w * 0.15, h * 0.40, h * 0.60);
    fill.addColorStop(0.0, 'rgba(206,224,244,0.68)');
    fill.addColorStop(1.0, 'rgba(206,224,244,0)');
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);

    /* بازتاب گرم از پایین */
    var bounce = g.createRadialGradient(w * 0.44, h * 0.98, 0, w * 0.44, h * 0.98, h * 0.55);
    bounce.addColorStop(0.0, 'rgba(214,126,88,0.62)');
    bounce.addColorStop(1.0, 'rgba(214,126,88,0)');
    g.fillStyle = bounce;
    g.fillRect(0, 0, w, h);

    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- صحنه ---------------- */

  /**
   * @param {HTMLElement} container
   * @returns {{destroy:Function}|null}
   */
  ZZ.heroScene = function (container) {
    var THREE = global.THREE;
    if (!container) return null;

    if (!THREE || !hasWebGL()) {
      container.classList.add('is-fallback');
      return null;
    }

    var P = deviceProfile();
    var reduced = ZZ.u.reducedMotion();

    /* ---------- رندرر ---------- */
    var renderer = new THREE.WebGLRenderer({
      antialias: P.antialias,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(P.dpr);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0, 8.2);

    var envMap = makeEnvTexture(THREE);
    scene.environment = envMap;

    var disposables = [envMap];

    /* ---------- نورپردازی ---------- */
    scene.add(new THREE.AmbientLight(0xfff2e6, 0.42));
    scene.add(new THREE.HemisphereLight(0xfffaf4, 0xc98a72, 0.72));

    var keyLight = new THREE.DirectionalLight(0xfff8f0, 1.7);
    keyLight.position.set(3.2, 4.0, 5.4);
    scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0xc6dcf2, 0.62);
    fillLight.position.set(-4.4, -1.2, 2.8);
    scene.add(fillLight);

    var rimLight = new THREE.PointLight(0xd98a66, 2.6, 20, 2.2);
    rimLight.position.set(-2.8, 1.8, -3.2);
    scene.add(rimLight);

    /* نور مرکزی داخل حلقه — قلب صحنه */
    var coreLight = new THREE.PointLight(0xffdcc0, 2.2, 7, 2);
    coreLight.position.set(0, 0, 0.6);
    scene.add(coreLight);

    /* ---------- گروه‌ها ---------- */
    var root = new THREE.Group();
    scene.add(root);

    var orbit = new THREE.Group();      // همه‌ی المان‌های شناور
    root.add(orbit);

    /* ---------- متریال‌ها ---------- */

    function standard(opts) {
      var m = new THREE.MeshStandardMaterial(Object.assign({
        envMap: envMap, envMapIntensity: 1.2
      }, opts));
      disposables.push(m);
      return m;
    }
    function physical(opts) {
      var m = new THREE.MeshPhysicalMaterial(Object.assign({
        envMap: envMap, envMapIntensity: 1.2
      }, opts));
      disposables.push(m);
      return m;
    }

    /* رزگلد سیر — حلقه‌ی اصلی */
    var matRoseGold = standard({
      color: 0xa8543a, metalness: 0.95, roughness: 0.17, envMapIntensity: 1.6
    });

    /* طلای روشن — کمان‌ها و جزئیات */
    var matGold = standard({
      color: 0xc9955e, metalness: 0.88, roughness: 0.28, envMapIntensity: 1.35
    });

    /* شیشه‌ی صورتی — قطره‌ها. transmission گران است پس فقط
       روی دسکتاپ فعال می‌شود؛ روی موبایل نسخه‌ی شفافِ ساده. */
    var matGlass = P.lowEnd
      ? standard({
          color: 0xf3cdb8, metalness: 0.1, roughness: 0.12,
          transparent: true, opacity: 0.55, envMapIntensity: 1.5
        })
      : physical({
          color: 0xf6dbc9, metalness: 0.0, roughness: 0.06,
          transmission: 0.92, thickness: 0.9, ior: 1.45,
          clearcoat: 1.0, clearcoatRoughness: 0.04,
          transparent: true, opacity: 1, envMapIntensity: 1.7
        });

    /* کریستال مات — کنتراست با سطوح براق */
    var matCrystal = standard({
      color: 0x7d3d28, metalness: 0.72, roughness: 0.34, envMapIntensity: 1.2
    });

    /* ---------- ۱. حلقه‌ی نور (المان اصلی) ---------- */
    var ringGroup = new THREE.Group();
    orbit.add(ringGroup);

    var ringGeo = new THREE.TorusGeometry(1.25, 0.085, P.ringSeg[1], P.ringSeg[0]);
    var ring = new THREE.Mesh(ringGeo, matRoseGold);
    ringGroup.add(ring);
    disposables.push(ringGeo);

    /* حلقه‌ی دوم، نازک‌تر و کمی بزرگ‌تر */
    var ring2Geo = new THREE.TorusGeometry(1.52, 0.020, 6, Math.round(P.ringSeg[0] * 0.8));
    var ring2 = new THREE.Mesh(ring2Geo, matGold);
    ring2.rotation.x = 0.42;
    ringGroup.add(ring2);
    disposables.push(ring2Geo);

    /* ---------- ۲. قطره‌های شیشه‌ای ---------- */
    var drops = [];
    for (var i = 0; i < P.drops; i++) {
      var r = 0.20 + Math.random() * 0.22;
      var geo = new THREE.SphereGeometry(r, P.dropSeg[0], P.dropSeg[1]);
      var mesh = new THREE.Mesh(geo, matGlass);

      var ang = (i / P.drops) * Math.PI * 2 + 0.4;
      var rad = 1.05 + Math.random() * 0.95;
      mesh.position.set(
        Math.cos(ang) * rad,
        Math.sin(ang) * rad * 0.72,
        (Math.random() - 0.5) * 1.6
      );
      /* قطره‌ها کمی کشیده‌اند، مثل قطره‌ی واقعی */
      mesh.scale.set(1, 1 + Math.random() * 0.35, 1);

      mesh.userData = {
        ang: ang,
        rad: rad,
        speed: 0.10 + Math.random() * 0.16,
        bobPhase: Math.random() * Math.PI * 2,
        bobAmp: 0.10 + Math.random() * 0.18,
        spin: (Math.random() - 0.5) * 0.5
      };
      orbit.add(mesh);
      drops.push(mesh);
      disposables.push(geo);
    }

    /* ---------- ۳. کریستال‌های رزگلد ---------- */
    var crystals = [];
    for (var k = 0; k < P.crystals; k++) {
      /* اکتاهدرون: فرم هندسی تیز که با فرم‌های گرد کنتراست دارد */
      var cGeo = new THREE.OctahedronGeometry(0.17 + Math.random() * 0.13, 0);
      var cMesh = new THREE.Mesh(cGeo, k % 2 === 0 ? matCrystal : matGold);

      var cAng = (k / P.crystals) * Math.PI * 2 + 1.1;
      var cRad = 1.15 + Math.random() * 0.85;
      cMesh.position.set(
        Math.cos(cAng) * cRad,
        Math.sin(cAng) * cRad * 0.68,
        -0.4 + (Math.random() - 0.5) * 1.4
      );
      cMesh.userData = {
        ang: cAng,
        rad: cRad,
        speed: -(0.08 + Math.random() * 0.14),   // خلاف جهت قطره‌ها
        bobPhase: Math.random() * Math.PI * 2,
        bobAmp: 0.12 + Math.random() * 0.16,
        rx: (Math.random() - 0.5) * 0.9,
        ry: (Math.random() - 0.5) * 0.9
      };
      orbit.add(cMesh);
      crystals.push(cMesh);
      disposables.push(cGeo);
    }

    /* ---------- ۴. کمان‌های نازک ---------- */
    var arcs = [];
    var arcDefs = [
      { r: 1.90, tube: 0.011, span: Math.PI * 0.55, rx: 0.35, rz: 0.5,  spin: 0.030 },
      { r: 2.18, tube: 0.009, span: Math.PI * 0.38, rx: -0.5, rz: -1.1, spin: -0.022 },
      { r: 1.70, tube: 0.008, span: Math.PI * 0.30, rx: 0.8,  rz: 2.0,  spin: 0.040 }
    ];
    for (var a = 0; a < P.arcs; a++) {
      var d = arcDefs[a];
      var aGeo = new THREE.TorusGeometry(d.r, d.tube, 4, P.lowEnd ? 50 : 90, d.span);
      var aMesh = new THREE.Mesh(aGeo, matGold);
      aMesh.rotation.set(d.rx, 0, d.rz);
      aMesh.userData = { spin: d.spin };
      orbit.add(aMesh);
      arcs.push(aMesh);
      disposables.push(aGeo);
    }

    /* ---------- ۵. گرد نور ---------- */
    var glowTex = makeGlowTexture(THREE);
    disposables.push(glowTex);

    var bokehMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xf5d5b8, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
    });
    disposables.push(bokehMat);

    var bokehGroup = new THREE.Group();
    root.add(bokehGroup);

    var bokeh = [];
    for (var b = 0; b < P.bokeh; b++) {
      var sp = new THREE.Sprite(bokehMat);
      var sc = 0.05 + Math.random() * 0.13;
      sp.scale.set(sc, sc, 1);
      sp.position.set(
        (Math.random() - 0.5) * 7.5,
        (Math.random() - 0.5) * 5.0,
        -1.2 - Math.random() * 2.8
      );
      sp.userData = {
        baseY: sp.position.y,
        speed: 0.10 + Math.random() * 0.24,
        phase: Math.random() * Math.PI * 2,
        amp: 0.12 + Math.random() * 0.24
      };
      bokehGroup.add(sp);
      bokeh.push(sp);
    }

    /* هاله‌ی مرکزی نرم */
    var auraMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xeeb391, transparent: true,
      opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var aura = new THREE.Sprite(auraMat);
    aura.scale.set(3.4, 3.4, 1);
    aura.position.z = -1.3;
    root.add(aura);
    disposables.push(auraMat);

    /* ---------------- حالت و تعامل ---------------- */
    var pointer = { x: 0, y: 0 };
    var target = { x: 0, y: 0 };
    var hasPointer = false;
    var lastPointerAt = 0;
    var idleAim = { x: 0, y: 0 };
    var nextIdleAt = 0;

    var scrollN = 0;
    var visible = true;
    var running = false;
    var rafId = 0;
    var clock = new THREE.Clock();

    /* easing مستقل از نرخ فریم */
    function damp(cur, goal, lambda, dt) {
      return goal + (cur - goal) * Math.exp(-lambda * dt);
    }

    function onPointerMove(e) {
      var t = e.touches ? e.touches[0] : e;
      target.x = (t.clientX / global.innerWidth) * 2 - 1;
      target.y = (t.clientY / global.innerHeight) * 2 - 1;
      hasPointer = true;
      lastPointerAt = performance.now();
    }
    function onPointerLeave() { hasPointer = false; target.x = 0; target.y = 0; }

    function onOrient(e) {
      if (e.gamma == null || e.beta == null) return;
      target.x = Math.max(-1, Math.min(1, e.gamma / 30));
      target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 38));
      hasPointer = true;
      lastPointerAt = performance.now();
    }

    function onScroll() {
      var rect = container.getBoundingClientRect();
      var h = global.innerHeight || 1;
      scrollN = Math.max(0, Math.min(1, -rect.top / h));
    }

    if (!P.coarse) {
      global.addEventListener('pointermove', onPointerMove, { passive: true });
      global.addEventListener('pointerleave', onPointerLeave, { passive: true });
    } else if (global.DeviceOrientationEvent && !reduced) {
      global.addEventListener('deviceorientation', onOrient, { passive: true });
    }
    global.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------------- قاب‌بندی ---------------- */
    var baseY = 0, baseScale = 1;

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;

      var dpr = P.dpr;
      var px = w * h * dpr * dpr;
      if (px > P.maxPixels) dpr *= Math.sqrt(P.maxPixels / px);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);

      var ar = w / h;
      camera.aspect = ar;

      if (w < 720) {
        camera.position.z = ar < 0.75 ? 7.6 : 6.9;
        baseY = 0; baseScale = 0.94;
      } else if (w < 1024) {
        camera.position.z = 7.2;
        baseY = 0.10; baseScale = 0.92;
      } else {
        camera.position.z = 6.4;
        baseY = 0.02; baseScale = 1.0;
      }
      camera.updateProjectionMatrix();
    }

    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(ZZ.u.debounce(resize, 90));
      ro.observe(container);
    } else {
      global.addEventListener('resize', ZZ.u.debounce(resize, 120));
    }
    resize();

    /* ---------------- حلقه‌ی رندر ---------------- */
    function render(dt, el) {
      var now = performance.now();
      if (hasPointer && now - lastPointerAt > 2600) hasPointer = false;

      /* حالت idle: هدف آرام و تصادفی */
      if (!hasPointer) {
        if (now >= nextIdleAt) {
          idleAim.x = (Math.random() - 0.5) * 0.7;
          idleAim.y = (Math.random() - 0.5) * 0.45;
          nextIdleAt = now + 3200 + Math.random() * 2800;
        }
        target.x = idleAim.x;
        target.y = idleAim.y;
      }

      pointer.x = damp(pointer.x, target.x, hasPointer ? 2.8 : 1.1, dt);
      pointer.y = damp(pointer.y, target.y, hasPointer ? 2.8 : 1.1, dt);

      /* --- حلقه‌ی اصلی: چرخش آرام + پاسخ به موس --- */
      ringGroup.rotation.z = el * 0.05;
      ringGroup.rotation.y = pointer.x * 0.55 + Math.sin(el * 0.22) * 0.10;
      ringGroup.rotation.x = -pointer.y * 0.38 + Math.cos(el * 0.19) * 0.08;
      ring2.rotation.z = -el * 0.09;

      /* تپش نور مرکزی */
      coreLight.intensity = 1.9 + Math.sin(el * 1.1) * 0.55;
      aura.material.opacity = 0.22 + Math.sin(el * 1.1) * 0.06;

      /* --- قطره‌ها: چرخش روی مدار + شناوری --- */
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i], ud = d.userData;
        var ang = ud.ang + el * ud.speed;
        d.position.x = Math.cos(ang) * ud.rad;
        d.position.y = Math.sin(ang) * ud.rad * 0.72 +
                       Math.sin(el * 0.7 + ud.bobPhase) * ud.bobAmp;
        d.rotation.y += dt * ud.spin;
        d.rotation.x += dt * ud.spin * 0.6;
      }

      /* --- کریستال‌ها: مدار معکوس + چرخش محوری --- */
      for (var k = 0; k < crystals.length; k++) {
        var c = crystals[k], uc = c.userData;
        var cang = uc.ang + el * uc.speed;
        c.position.x = Math.cos(cang) * uc.rad;
        c.position.y = Math.sin(cang) * uc.rad * 0.68 +
                       Math.sin(el * 0.6 + uc.bobPhase) * uc.bobAmp;
        c.rotation.x += dt * uc.rx;
        c.rotation.y += dt * uc.ry;
      }

      /* --- کمان‌ها --- */
      for (var a = 0; a < arcs.length; a++) {
        arcs[a].rotation.z += dt * arcs[a].userData.spin;
      }

      /* کل مدار با موس کمی می‌چرخد → حس پارالاکس */
      orbit.rotation.y = pointer.x * 0.28;
      orbit.rotation.x = -pointer.y * 0.18;

      /* --- گرد نور --- */
      for (var b = 0; b < bokeh.length; b++) {
        var sp = bokeh[b], ub = sp.userData;
        sp.position.y = ub.baseY + Math.sin(el * ub.speed + ub.phase) * ub.amp;
      }
      bokehGroup.rotation.y = pointer.x * 0.05;

      /* --- اسکرول --- */
      root.position.y = baseY + scrollN * 0.9;
      root.rotation.y = scrollN * 0.35;
      root.scale.setScalar(baseScale * (1 - scrollN * 0.13));

      renderer.render(scene, camera);
    }

    function loop() {
      if (!running) return;
      rafId = global.requestAnimationFrame(loop);
      var dt = Math.min(clock.getDelta(), 0.05);
      render(dt, clock.elapsedTime);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      clock.getDelta();
      loop();
    }
    function stop() {
      running = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    var io = null;
    if ('IntersectionObserver' in global) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) start(); else stop();
      }, { threshold: 0.02 });
      io.observe(container);
    } else {
      start();
    }

    function onVisibility() {
      if (document.hidden) stop();
      else if (visible) start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    if (reduced) {
      pointer.x = 0.15; pointer.y = -0.08;
      render(0.016, 1.6);
    } else {
      start();
    }

    container.classList.add('is-ready');

    return {
      destroy: function () {
        stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        global.removeEventListener('pointermove', onPointerMove);
        global.removeEventListener('pointerleave', onPointerLeave);
        global.removeEventListener('deviceorientation', onOrient);
        global.removeEventListener('scroll', onScroll);
        disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  };
})(window);
