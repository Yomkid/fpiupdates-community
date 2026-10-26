import { useState } from 'react';
import type { User } from './api';
export const occupations = [
  'Student',
  'Software developer',
  'Engineer',
  'Teacher / educator',
  'Designer',
  'Entrepreneur',
  'Healthcare professional',
  'Researcher',
  'Content creator',
  'Artisan / technician',
  'Job seeker',
];
export function parseSkills(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
export function OccupationFields({ user }: { user?: Partial<User> | null }) {
  const initial = user?.occupation ?? '';
  const [choice, setChoice] = useState(
    occupations.includes(initial) ? initial : initial ? 'OTHER' : '',
  );
  const [skills, setSkills] = useState((user?.skills ?? []).join(', '));
  const items = parseSkills(skills);
  const invalid = items.length > 8 || items.some((s) => s.length > 40);
  return (
    <>
      <label>
        Occupation or profession (public, optional)
        <select
          aria-label="Occupation or profession"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Choose later</option>
          {occupations.map((x) => (
            <option key={x}>{x}</option>
          ))}
          <option value="OTHER">Other — write your own</option>
        </select>
      </label>
      {choice === 'OTHER' ? (
        <label>
          Your occupation
          <input
            name="occupation"
            autoComplete="organization-title"
            defaultValue={occupations.includes(initial) ? '' : initial}
            placeholder="For example, Cybersecurity analyst"
            maxLength={120}
            required
          />
        </label>
      ) : (
        <input type="hidden" name="occupation" value={choice} />
      )}
      <label>
        Skills (public, optional)
        <input
          name="skills"
          aria-label="Skills (public, optional)"
          aria-describedby="skills-help"
          value={skills}
          maxLength={400}
          placeholder="For example, Graphic design, Python, Writing"
          onChange={(e) => {
            const value = e.target.value;
            setSkills(value);
            const list = parseSkills(value);
            e.target.setCustomValidity(
              list.length > 8
                ? 'Choose up to 8 skills.'
                : list.some((s) => s.length > 40)
                  ? 'Each skill must be 40 characters or fewer.'
                  : '',
            );
          }}
        />
        <small
          id="skills-help"
          className={
            'field-hint ' + (invalid ? 'field-error' : items.length ? 'field-success' : '')
          }
        >
          {invalid
            ? 'Use up to 8 skills, with 40 characters or fewer each.'
            : 'Separate up to 8 skills with commas. These appear on your profile.'}
        </small>
      </label>
    </>
  );
}
export function GenderField({ value }: { value?: string | null }) {
  return (
    <label>
      Gender (private, optional)
      <select name="gender" aria-label="Gender (private, optional)" defaultValue={value ?? ''}>
        <option value="">Choose later</option>
        <option value="MALE">Male</option>
        <option value="FEMALE">Female</option>
        <option value="NON_BINARY">Non-binary</option>
        <option value="OTHER">Other</option>
        <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
      </select>
      <small className="field-hint">Visible only in your account settings.</small>
    </label>
  );
}
