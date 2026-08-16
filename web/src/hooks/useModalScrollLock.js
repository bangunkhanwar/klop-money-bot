import { useEffect } from 'react';

let activeLocks = 0;
let savedStyles = null;

function lockPage() {
  if (activeLocks === 0) {
    const scrollY = window.scrollY;
    savedStyles = {
      scrollY,
      body: {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width
      },
      overscrollBehavior: document.documentElement.style.overscrollBehavior
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overscrollBehavior = 'none';
  }
  activeLocks += 1;
}

function unlockPage() {
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks !== 0 || !savedStyles) return;
  document.body.style.overflow = savedStyles.body.overflow;
  document.body.style.position = savedStyles.body.position;
  document.body.style.top = savedStyles.body.top;
  document.body.style.width = savedStyles.body.width;
  document.documentElement.style.overscrollBehavior = savedStyles.overscrollBehavior;
  window.scrollTo(0, savedStyles.scrollY);
  savedStyles = null;
}

export default function useModalScrollLock(open = true) {
  useEffect(() => {
    if (!open) return undefined;
    lockPage();
    return unlockPage;
  }, [open]);
}
