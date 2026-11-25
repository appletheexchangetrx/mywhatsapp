export function bindMessageInput({
  form,
  input,
  button,
  onSend,
  isSending = () => false,
  onSendingChange = () => {},
}) {
  if (!form || !input) return () => {};

  const setSending = (value) => {
    onSendingChange(Boolean(value));
    if (button) button.disabled = Boolean(value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || isSending()) return;

    setSending(true);
    try {
      await onSend?.(message);
    } finally {
      setSending(false);
      input.focus();
    }
  };

  const handleKeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  };

  form.addEventListener("submit", handleSubmit);
  input.addEventListener("keydown", handleKeydown);

  return () => {
    form.removeEventListener("submit", handleSubmit);
    input.removeEventListener("keydown", handleKeydown);
  };
}
