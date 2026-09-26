// هوية "مدار": كلمة مدار معناها المسار اللي بيلف حوالين كوكب - فاللوجو عربية توزيع
// بصندوق مقفول ماشية على مدار حوالين الكرة الأرضية. نفس الرسمة بتتعرض ثابتة (اللوجو)،
// أو متحركة (شاشة التحميل: الأرض بتلف والعربية بتجري وراها). ملف واحد هو المصدر لكل
// النسخ - حتى ملفات logo.svg و logo-animated.svg اللي بتتولّد منه للتسويق.
const Brand = (() => {
  const C = {
    oceanLight: '#3fb58f',
    ocean: '#1d6f5e',
    oceanDeep: '#0f3d31',
    land: '#a8e6c5',
    rim: '#123f32',
    orbit: '#c9a24b',
    orbitGlow: '#f1d38a',
    box: '#fdfaf2',
    boxStroke: '#123f32',
    cab: '#1d6f5e',
    glass: '#d6f3e8',
    tire: '#1b1f1d',
    hub: '#cfd8d3',
    light: '#ffe08a',
  };

  // هندسة ثابتة داخل viewBox مقاسه 160×140
  const CX = 80;
  const CY = 74;
  const R = 38;
  const RX = 66;
  const RY = 21;
  const TILT = -14;
  const STRIP_W = 152; // عرض شريط القارات = 4R، بيتكرر نسختين عشان اللف يبقى متصل من غير قطع

  const CONTINENTS = [
    'M14,-26 C22,-30 30,-24 28,-16 C26,-9 20,-8 21,-2 C22,4 28,8 26,16 C24,24 18,30 15,24 C12,18 14,10 10,4 C6,-2 4,-10 7,-18 C9,-23 11,-25 14,-26 Z',
    'M40,-30 C44,-33 50,-32 50,-28 C50,-25 44,-24 41,-26 Z',
    'M62,-24 C70,-28 80,-26 82,-18 C84,-12 78,-10 80,-4 C83,4 86,8 82,16 C78,24 72,28 68,22 C64,16 66,8 62,2 C58,-4 54,-8 56,-14 C57,-20 58,-22 62,-24 Z',
    'M96,-22 C106,-28 124,-26 132,-18 C138,-12 134,-6 126,-4 C120,-2 116,4 110,2 C104,0 100,-6 96,-8 C92,-10 90,-18 96,-22 Z',
    'M118,12 C124,8 132,10 132,16 C132,22 124,24 119,21 C115,19 114,15 118,12 Z',
  ];

  let seq = 0;

  function wheel(x, animated, spinDur) {
    const spin = animated
      ? `<animateTransform attributeName="transform" type="rotate" from="0 ${x} -1.5" to="360 ${x} -1.5" dur="${spinDur}s" repeatCount="indefinite"/>`
      : '';
    return `<g>
      <circle cx="${x}" cy="-1.5" r="3.1" fill="${C.tire}"/>
      <g>${spin}
        <circle cx="${x}" cy="-1.5" r="1.25" fill="${C.hub}"/>
        <rect x="${x - 0.35}" y="-4.2" width="0.7" height="5.4" fill="${C.hub}" opacity="0.7"/>
      </g>
    </g>`;
  }

  // العربية مرسومة بمحور أصله عند نقطة ملامسة العجل للطريق، والمقدمة ناحية +x -
  // كده animateMotion بـ rotate="auto" بيمشيها على المدار وعجلها دايمًا لازق فيه
  function van(animated, spinDur) {
    const speedLines = animated
      ? `<g stroke="${C.orbitGlow}" stroke-width="1.1" stroke-linecap="round" opacity="0.9">
          <line x1="-19" y1="-13" x2="-26" y2="-13"><animate attributeName="opacity" values="1;0.2;1" dur="0.45s" repeatCount="indefinite"/></line>
          <line x1="-18" y1="-9" x2="-29" y2="-9"><animate attributeName="opacity" values="0.3;1;0.3" dur="0.45s" repeatCount="indefinite"/></line>
          <line x1="-19" y1="-5" x2="-24" y2="-5"><animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite"/></line>
        </g>`
      : '';
    return `${speedLines}
      <rect x="-15.5" y="-18" width="20" height="14" rx="1.8" fill="${C.box}" stroke="${C.boxStroke}" stroke-width="1"/>
      <rect x="-15.5" y="-11.2" width="20" height="2.4" fill="${C.orbit}"/>
      <path d="M4.5,-4 L4.5,-14.5 L10.6,-14.5 L15.2,-8.2 L15.6,-4 Z" fill="${C.cab}" stroke="${C.boxStroke}" stroke-width="0.8" stroke-linejoin="round"/>
      <path d="M6.3,-13 L10,-13 L13.1,-8.6 L6.3,-8.6 Z" fill="${C.glass}"/>
      <rect x="-15.8" y="-5" width="31.6" height="2.6" rx="1" fill="${C.rim}"/>
      <circle cx="15" cy="-6" r="0.95" fill="${C.light}"/>
      ${wheel(-9, animated, spinDur)}
      ${wheel(9.2, animated, spinDur)}`;
  }

  /**
   * @param {object} opts
   * @param {number} [opts.size]      عرض اللوجو بالبكسل
   * @param {boolean} [opts.animated] الأرض بتلف والعربية بتلف حواليها
   * @param {number} [opts.orbitSeconds] زمن اللفة الكاملة للعربية
   * @param {string} [opts.title]
   */
  function logoSvg({ size = 40, animated = false, orbitSeconds = 6, title = 'مدار' } = {}) {
    const id = `madar${++seq}`;
    const spinSeconds = orbitSeconds * 1.25; // الأرض أبطأ شوية من العربية - فالعربية "بتجري وراها" وبتسبقها
    const height = Math.round((size * 140) / 160);

    const strip = CONTINENTS.map((d) => `<path d="${d}"/>`).join('');
    const stripScroll = animated
      ? `<animateTransform attributeName="transform" type="translate" from="${CX - R - STRIP_W} ${CY}" to="${CX - R} ${CY}" dur="${spinSeconds}s" repeatCount="indefinite"/>`
      : '';
    const stripStart = animated ? CX - R - STRIP_W : CX - 70;

    // موضع العربية الثابت: فوق يمين المدار، ماشية مع اتجاه اللف
    const t = (-65 * Math.PI) / 180;
    const vx = CX + RX * Math.cos(t);
    const vy = CY + RY * Math.sin(t);
    const heading = (Math.atan2(RY * Math.cos(t), -RX * Math.sin(t)) * 180) / Math.PI;
    const orbitPath = `M${CX},${CY - RY} A${RX},${RY} 0 1,1 ${CX},${CY + RY} A${RX},${RY} 0 1,1 ${CX},${CY - RY}`;

    // عمق: وهي بتلف ورا الأرض (النص الخلفي من المدار) بتصغر وتبهت شوية، فتحس إنها بعدت فعلًا
    const depthTimes = '0;0.18;0.32;0.68;0.82;1';
    const vanPlacement = animated
      ? `<g>
          <g>
            ${van(true, 0.35)}
            <animate attributeName="opacity" values="1;1;0.4;0.4;1;1" keyTimes="${depthTimes}" dur="${orbitSeconds}s" repeatCount="indefinite"/>
            <animateTransform attributeName="transform" type="scale" values="1;1;0.72;0.72;1;1" keyTimes="${depthTimes}" dur="${orbitSeconds}s" repeatCount="indefinite"/>
          </g>
          <animateMotion dur="${orbitSeconds}s" repeatCount="indefinite" rotate="auto" path="${orbitPath}"/>
        </g>`
      : `<g transform="translate(${vx.toFixed(2)} ${vy.toFixed(2)}) rotate(${heading.toFixed(2)})">${van(false)}</g>`;

    const dashAnim = animated
      ? `<animate attributeName="stroke-dashoffset" from="0" to="-22" dur="${Math.max(orbitSeconds / 4, 0.4)}s" repeatCount="indefinite"/>`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 140" width="${size}" height="${height}" role="img" aria-label="${title}" class="madar-logo">
  <title>${title}</title>
  <defs>
    <radialGradient id="${id}-ocean" cx="36%" cy="30%" r="75%">
      <stop offset="0%" stop-color="${C.oceanLight}"/>
      <stop offset="55%" stop-color="${C.ocean}"/>
      <stop offset="100%" stop-color="${C.oceanDeep}"/>
    </radialGradient>
    <radialGradient id="${id}-shade" cx="36%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="38%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#001a12" stop-opacity="0.42"/>
    </radialGradient>
    <clipPath id="${id}-globe"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath>
    <mask id="${id}-occlude" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="140">
      <rect x="-40" y="-40" width="240" height="220" fill="#fff"/>
      <g transform="rotate(${TILT} ${CX} ${CY})">
        <path d="M${CX - R - 0.5},${CY} A${R + 0.5},${R + 0.5} 0 0,0 ${CX + R + 0.5},${CY} Z" fill="#000"/>
      </g>
    </mask>
  </defs>

  <circle cx="${CX}" cy="${CY}" r="${R + 3.5}" fill="none" stroke="${C.oceanLight}" stroke-opacity="0.22" stroke-width="4"/>

  <g transform="rotate(${TILT} ${CX} ${CY})">
    <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="none" stroke="${C.orbit}" stroke-opacity="0.55" stroke-width="2"/>
  </g>

  <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-ocean)"/>
  <g clip-path="url(#${id}-globe)">
    <g fill="${C.land}" fill-opacity="0.92" transform="translate(${stripStart} ${CY})">
      ${stripScroll}
      <g>${strip}</g>
      <g transform="translate(${STRIP_W} 0)">${strip}</g>
    </g>
    <g fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="0.8">
      <ellipse cx="${CX}" cy="${CY}" rx="${R}" ry="6"/>
      <ellipse cx="${CX}" cy="${CY - 19}" rx="${R * 0.86}" ry="4.5"/>
      <ellipse cx="${CX}" cy="${CY + 19}" rx="${R * 0.86}" ry="4.5"/>
    </g>
  </g>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-shade)"/>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${C.rim}" stroke-width="1.3"/>

  <g transform="rotate(${TILT} ${CX} ${CY})">
    <path d="M${CX - RX},${CY} A${RX},${RY} 0 0,1 ${CX + RX},${CY}" fill="none" stroke="${C.orbit}" stroke-width="2.4" stroke-linecap="round" ${animated ? 'stroke-dasharray="14 8"' : ''}>${dashAnim}</path>
  </g>

  <g mask="url(#${id}-occlude)">
    <g transform="rotate(${TILT} ${CX} ${CY})">${vanPlacement}</g>
  </g>
</svg>`;
  }

  // لو المستخدم مفعّل "تقليل الحركة" في جهازه بنعرض اللوجو ثابت بدل المتحرك
  function reducedMotion() {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** شاشة تحميل: الأرض بتلف بسرعة والعربية بتجري وراها */
  function loaderHtml(text = 'جارِ التحميل...') {
    return `<div class="madar-loader" role="status" aria-live="polite">
      ${logoSvg({ size: 132, animated: !reducedMotion(), orbitSeconds: 1.8, title: text })}
      <div class="madar-loader-text">${text}</div>
    </div>`;
  }

  return { logoSvg, loaderHtml, reducedMotion };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Brand;
