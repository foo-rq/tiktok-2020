const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');

// Fake storage and the button so each case starts with its own theme choice
function setup(saved, blocked = false) {
  const root = { dataset: {} },
    button = {
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
      }
    };

  // Use the same failure for reads and writes to simulate blocked browser storage
  const storage = {
    getItem() {
      if (blocked) throw Error();
      return saved;
    },
    setItem(k, v) {
      if (blocked) throw Error();
      saved = v;
    }
  };
  vm.runInNewContext(fs.readFileSync('theme.js', 'utf8'), {
    document: {
      documentElement: root,
      getElementById: () => button,
      addEventListener: (event, fn) => fn()
    },
    localStorage: storage
  });

  // Read the saved value through a function so assertions see later click updates
  return { root, button, saved: () => saved };
}

// Fresh visits should stay light even if the device prefers dark
const light = setup(null);
assert.equal(light.root.dataset.theme, 'light');
assert.equal(light.button.attributes['aria-label'], 'Switch to dark mode');

// Check that light mode offers the moon rather than showing the sun
assert(light.button.innerHTML.includes('M9.528'));

// The icon offers the opposite theme and the click should save that choice
light.button.onclick();
assert.equal(light.saved(), 'dark');
assert(light.button.innerHTML.includes('M12 2.25'));

// Switching back should overwrite the saved choice rather than leave dark behind
light.button.onclick();
assert.equal(light.saved(), 'light');

// Restore a valid saved choice but ignore an unknown value
assert.equal(setup('dark').root.dataset.theme, 'dark');
assert.equal(setup('invalid').root.dataset.theme, 'light');

// Private browsing can reject storage but the toggle should still work
const blocked = setup(null, true);
blocked.button.onclick();
assert.equal(blocked.root.dataset.theme, 'dark');
console.log(
  'Default light mode, theme icons, persistence and storage-error checks passed.'
);
