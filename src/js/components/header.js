export function setConnection(root, label, color = "#f59e0b") {
  if (!root) return;
  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.style.backgroundColor = color;
  const text = document.createElement("span");
  text.textContent = String(label ?? "");
  root.replaceChildren(dot, text);
}
