// Publishes the on-screen keyboard height as the CSS variable --kb (from visualViewport),
// so bottom-anchored HUD pieces (word input, chat) can sit right above the keyboard on phones.

export function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let last = -1;
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    if (kb === last) return;
    last = kb;
    root.style.setProperty('--kb', `${kb}px`);
    root.classList.toggle('kb-open', kb > 80);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
