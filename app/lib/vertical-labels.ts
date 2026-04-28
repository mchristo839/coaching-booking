// app/lib/vertical-labels.ts
// Per-vertical noun translations for the dashboard chrome.
//
// Drives the "fitness studio" reskin without forking pages: each vertical
// returns the same shape, components reach for the term they need, and
// `vertical='sport'` (the default for every existing coach) keeps the
// current copy.
//
// Add new keys here as the dashboard grows — keep the shape symmetric.

export type Vertical = 'sport' | 'fitness'

export interface VerticalLabels {
  programme: string         // singular
  programmes: string        // plural
  programmeShort: string    // brand chrome (sidebar, page titles)
  coach: string
  coaches: string
  member: string
  members: string
  session: string           // a single training/class instance
  sessions: string
  group: string             // WhatsApp group label
  groups: string
  // Page-level chrome
  controlCentre: string
  // Action verb used in CTAs ("Add a programme" vs "Add a class")
  newProgrammeCta: string
}

const SPORT_LABELS: VerticalLabels = {
  programme: 'programme',
  programmes: 'programmes',
  programmeShort: 'Programmes',
  coach: 'coach',
  coaches: 'coaches',
  member: 'member',
  members: 'members',
  session: 'session',
  sessions: 'sessions',
  group: 'group',
  groups: 'groups',
  controlCentre: 'Control Centre',
  newProgrammeCta: 'New Programme',
}

const FITNESS_LABELS: VerticalLabels = {
  programme: 'class',
  programmes: 'classes',
  programmeShort: 'Classes',
  coach: 'trainer',
  coaches: 'trainers',
  member: 'client',
  members: 'clients',
  session: 'session',
  sessions: 'sessions',
  group: 'class group',
  groups: 'class groups',
  controlCentre: 'Studio Control',
  newProgrammeCta: 'New Class',
}

export function labelsFor(vertical: Vertical | null | undefined): VerticalLabels {
  return vertical === 'fitness' ? FITNESS_LABELS : SPORT_LABELS
}

// Title-case helper for headings — keep helper-local so we don't ship
// edge cases in component code.
export function title(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
