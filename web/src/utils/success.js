export function notifySuccess(title, message) {
  window.dispatchEvent(new CustomEvent('klop:success', { detail: { title, message } }));
}
