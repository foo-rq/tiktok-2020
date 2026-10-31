(() => {
  const root = document.documentElement;

  // Start light if there's no saved choice or storage is blocked
  let dark = false;
  try {
    dark = localStorage.getItem('tiktok2020-theme') === 'dark';
  } catch {}

  // Set this before the page paints so dark mode doesn't flash white
  root.dataset.theme = dark ? 'dark' : 'light';

  // The theme can apply now but the button needs the page to finish loading
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    function render() {
      root.dataset.theme = dark ? 'dark' : 'light';

      // Name the action the button will take rather than the current theme
      button.setAttribute(
        'aria-label',
        dark ? 'Switch to light mode' : 'Switch to dark mode'
      );

      // Keep the pressed state in sync for screen readers rather than relying on the icon
      button.setAttribute('aria-pressed', String(dark));

      // These paths are fixed artwork rather than user content
      // Pick the icon for the mode the user can switch to
      button.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        (dark
          ? '<path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z"/>'
          : '<path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clip-rule="evenodd"/>') +
        '</svg>';
    }

    // Still switch themes if saving the choice fails
    button.onclick = () => {

      // Apply the change immediately instead of waiting for storage to succeed
      dark = !dark;
      render();
      try {
        localStorage.setItem('tiktok2020-theme', root.dataset.theme);
      } catch {}
    };

    // Paint the initial button state even when the user never touches it
    render();
  });
})();
