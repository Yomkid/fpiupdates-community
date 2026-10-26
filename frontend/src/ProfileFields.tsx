import { useEffect, useState } from 'react';
import { api, type User } from './api';
export function UsernameField({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState('');
  useEffect(() => {
    const name = value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(name)) {
      setState(name ? 'Use 3–30 letters, numbers or underscores.' : '');
      return;
    }
    const controller = new AbortController();
    setState('Checking availability…');
    const timer = setTimeout(() => {
      api<{ available: boolean }>(
        '/auth/username-availability?username=' + encodeURIComponent(name),
        { signal: controller.signal },
      )
        .then((x) => {
          if (!controller.signal.aborted)
            setState(x.available ? 'Username available' : 'Username is already taken');
        })
        .catch(() => {
          if (!controller.signal.aborted) setState('Availability will be checked when you save.');
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  return (
    <label>
      Username
      <div className="input-prefix">
        <span>@</span>
        <input
          name="username"
          aria-label="Username"
          aria-describedby="username-hint"
          autoComplete="username"
          required
          pattern="[a-z0-9_]{3,30}"
          minLength={3}
          maxLength={30}
          value={value}
          aria-invalid={state === 'Username is already taken' || state.startsWith('Use ')}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          placeholder="yourname"
        />
      </div>
      <small
        id="username-hint"
        className={
          'field-hint ' +
          (state === 'Username available'
            ? 'field-success'
            : state === 'Username is already taken' || state.startsWith('Use ')
              ? 'field-error'
              : '')
        }
        aria-live="polite"
      >
        {state || '3–30 letters, numbers or underscores.'}
      </small>
    </label>
  );
}
export function PersonalFields({ user }: { user?: Partial<User> | null }) {
  return (
    <>
      <label>
        Date of birth (private, optional)
        <input
          name="dateOfBirth"
          type="date"
          min="1900-01-01"
          max={new Date().toISOString().slice(0, 10)}
          defaultValue={user?.dateOfBirth ?? ''}
          autoComplete="bday"
        />
      </label>
      <label>
        Phone number (private, optional)
        <input
          name="phoneNumber"
          type="tel"
          placeholder="+2348012345678"
          pattern="\+[1-9][0-9]{6,14}"
          maxLength={16}
          defaultValue={user?.phoneNumber ?? ''}
          autoComplete="tel"
        />
      </label>
      <label>
        Location (public, optional)
        <input
          name="location"
          maxLength={100}
          placeholder="For example, Ilaro, Ogun State"
          defaultValue={user?.location ?? ''}
          autoComplete="address-level2"
        />
      </label>
      <p className="form-note">
        Your phone number and birth date are visible only in your account settings. Location appears
        on your public profile. No phone verification is performed yet.
      </p>
    </>
  );
}
