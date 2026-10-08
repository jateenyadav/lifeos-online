import { useEffect, useRef, useState } from 'react';

let googleScript;

function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const fail = (message) => {
        clearTimeout(timeout);
        googleScript = undefined;
        script.remove();
        reject(new Error(message));
      };
      const timeout = setTimeout(() => {
        fail(
          'Google sign-in took too long to load. Check your connection and retry.',
        );
      }, 15000);
      script.onload = () => {
        if (!window.google?.accounts?.id) {
          fail('Google sign-in could not load. Please retry.');
          return;
        }
        clearTimeout(timeout);
        resolve(window.google);
      };
      script.onerror = () => {
        fail(
          'Google sign-in could not load. Check your connection or use your password.',
        );
      };
      document.head.appendChild(script);
    });
  }
  return googleScript;
}

export default function GoogleButton({ onCredential, onError, disabled }) {
  const container = useRef(null);
  const disabledRef = useRef(disabled);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let observer;
    let resizeButton;
    loadGoogle()
      .then((google) => {
        if (cancelled || !container.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          ux_mode: 'popup',
          callback: (result) => {
            if (cancelled || disabledRef.current) return;
            if (result.credential) onCredential(result.credential);
            else
              onError(
                'Google did not return an identity token. Please try again.',
              );
          },
        });
        let previousWidth;
        resizeButton = () => {
          if (cancelled || !container.current) return;
          const width = Math.min(
            400,
            Math.max(200, Math.floor(container.current.clientWidth)),
          );
          if (width === previousWidth) return;
          previousWidth = width;
          container.current.replaceChildren();
          google.accounts.id.renderButton(container.current, {
            theme: 'outline',
            size: 'large',
            shape: 'rectangular',
            text: 'continue_with',
            width,
          });
        };
        resizeButton();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(resizeButton);
          observer.observe(container.current);
        } else {
          window.addEventListener('resize', resizeButton);
        }
        setStatus('ready');
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus('failed');
          onError(error.message);
        }
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (resizeButton) window.removeEventListener('resize', resizeButton);
    };
  }, [clientId, onCredential, onError, attempt]);

  if (!clientId)
    return (
      <>
        <button className="google-placeholder" type="button" disabled>
          <span className="google-letter" aria-hidden="true">
            G
          </span>
          Continue with Google
        </button>
        <p className="setup-note">
          Google sign-in needs your Google client ID. Run npm run setup:google.
          See docs/GOOGLE_AUTH.md for the steps.
        </p>
      </>
    );
  return (
    <>
      <div
        className="google-button"
        ref={container}
        inert={disabled}
        aria-label="Google sign-in"
        aria-busy={status === 'loading'}
      />
      {status === 'loading' && (
        <p className="setup-note" role="status">
          Loading Google sign-in…
        </p>
      )}
      {status === 'failed' && (
        <button
          className="google-placeholder"
          type="button"
          disabled={disabled}
          onClick={() => {
            setStatus('loading');
            setAttempt((value) => value + 1);
          }}
        >
          Retry Google sign-in
        </button>
      )}
    </>
  );
}
