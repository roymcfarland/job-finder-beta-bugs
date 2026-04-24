export function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);

  if (options.className) {
    node.className = options.className;
  }

  if (options.text !== undefined) {
    node.textContent = String(options.text);
  }

  if (options.href) {
    node.href = options.href;
  }

  if (options.type) {
    node.type = options.type;
  }

  if (options.disabled) {
    node.disabled = true;
  }

  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[name] = String(value);
  }

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === false || value === null || value === undefined) {
      continue;
    }

    node.setAttribute(name, value === true ? "" : String(value));
  }

  node.append(
    ...children.flat().filter((child) => child !== null && child !== undefined),
  );
  return node;
}

export function formatTimestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown time"
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function variant(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}
