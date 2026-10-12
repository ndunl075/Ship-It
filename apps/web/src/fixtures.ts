import { landingCoordinates, type Launch, type Project } from '@ship-it/shared';

const names = [
  [
    'little-orbit',
    'Little Orbit',
    'A calmer corner of the internet. Notes, bookmarks, and things worth keeping.',
    'maya',
  ],
  ['palette-lab', 'Palette Lab', 'Playful color palettes for your next good idea.', 'felix'],
  ['field-notes', 'Field Notes', 'An open notebook for people who build things.', 'jules'],
  [
    'tiny-weather',
    'Tiny Weather',
    'Just the weather. Beautifully simple, wherever you are.',
    'nico',
  ],
  ['form-and-function', 'Form & Function', 'Small tools for thoughtful designers.', 'sam'],
  ['pocket-garden', 'Pocket Garden', 'A little space to grow your everyday habits.', 'river'],
  [
    'read-something',
    'Read Something',
    'Discover your next favorite independent publication.',
    'alex',
  ],
  ['soundspace', 'Soundspace', 'Ambient soundscapes for deep focus and daydreaming.', 'cleo'],
  ['pixel-post', 'Pixel Post', 'An open-source postcard maker for the internet.', 'leo'],
  ['weekend-build', 'Weekend Build', 'Make a little progress on your side project.', 'devon'],
  ['commonplace', 'Commonplace', 'Collect ideas. Connect the dots. Find something new.', 'remi'],
  ['daylight', 'Daylight', 'A gentle daily planner with room to breathe.', 'kai'],
  ['open-trails', 'Open Trails', 'A community-built journal of outdoor adventures.', 'noa'],
  ['syntax-cafe', 'Syntax Café', 'A cozy home for coding notes and experiments.', 'robin'],
  ['paper-plane', 'Paper Plane', 'Send a small thought into the world.', 'erin'],
  ['good-type', 'Good Type', 'A tiny playground for typography enthusiasts.', 'ash'],
] as const;
// Entirely invented projects. These fixtures never leave this browser or enter the API.
export const demoProjects: Project[] = names.map(([repository, name, description, owner], i) => ({
  id: `gh:${800000 + i}`,
  githubRepositoryId: 800000 + i,
  repository,
  name,
  description,
  owner,
  repoUrl: 'https://github.com/ndunl075/Ship-It',
  homepageUrl: null,
  ...landingCoordinates(800000 + i),
  latestLaunchedAt: new Date(Date.now() - i * 137000 - 30000).toISOString(),
  launchCount: [12, 8, 23, 5, 16, 3, 7, 18, 9, 4, 14, 6, 11, 2, 8, 15][i],
}));
export const demoLaunches: Launch[] = demoProjects
  .flatMap((project, i) =>
    Array.from({ length: project.launchCount }, (_, j) => ({
      id: `sim-${i}-${j}`,
      projectId: project.id,
      commitSha: (i.toString(16).padStart(2, '0') + j.toString(16).padStart(2, '0')).padEnd(
        40,
        'a',
      ),
      environment: 'production' as const,
      targetUrl: null,
      deployedAt: new Date(Date.parse(project.latestLaunchedAt) - j * 86400000).toISOString(),
      recordedAt: new Date(Date.parse(project.latestLaunchedAt) - j * 86400000).toISOString(),
      verifiedBy: 'github-deployment-status' as const,
    })),
  )
  .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
