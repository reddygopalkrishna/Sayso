import { z } from 'zod';

/**
 * The facts about you that Sayso can type on request ("type my email") and, later, use to fill
 * forms. They stay on this Mac. `phrases` are the ways you might ask for one, lowercase.
 */
export const PROFILE_FIELDS = [
  { key: 'name', label: 'Full name', phrases: ['my name', 'my full name'] },
  {
    key: 'email',
    label: 'Email address',
    phrases: ['my email', 'my email address', 'my email id', 'my mail id'],
  },
  {
    key: 'phone',
    label: 'Phone number',
    phrases: ['my phone', 'my phone number', 'my mobile', 'my mobile number', 'my number'],
  },
  { key: 'address', label: 'Address', phrases: ['my address', 'my home address'] },
  {
    key: 'company',
    label: 'Company',
    phrases: ['my company', 'my company name', 'my organization', 'my organisation'],
  },
  { key: 'website', label: 'Website', phrases: ['my website', 'my site'] },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    phrases: ['my linkedin', 'my linkedin profile', 'my linkedin url'],
  },
  { key: 'github', label: 'GitHub', phrases: ['my github', 'my github profile', 'my github url'] },
] as const;

export type ProfileKey = (typeof PROFILE_FIELDS)[number]['key'];
export const PROFILE_KEYS = PROFILE_FIELDS.map((f) => f.key) as [ProfileKey, ...ProfileKey[]];

/** What is saved: only the keys that have a value. */
export type ProfileValues = Partial<Record<ProfileKey, string>>;

export const MAX_PROFILE_VALUE = 500;

/** A change to the profile: a value sets a field, an empty string clears it. */
export const ProfilePatchSchema = z
  .object(
    Object.fromEntries(
      PROFILE_KEYS.map((key) => [key, z.string().max(MAX_PROFILE_VALUE)]),
    ) as Record<ProfileKey, z.ZodString>,
  )
  .partial()
  .strict();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;
