import {type TopicMigration} from './topics'

type TopicVersionAdapter = {
  toInstalled: (type: string, value: unknown) => unknown
  toApplication: (type: string, value: unknown) => unknown
}

type TopicCompatibility = {
  toInstalledEmission: TopicVersionAdapter['toInstalled']
  toApplicationStateValue: TopicVersionAdapter['toApplication']
  toApplicationEventPayload: TopicVersionAdapter['toApplication']
  toInstalledEventReply: TopicVersionAdapter['toInstalled']
  toApplicationEventReply: TopicVersionAdapter['toApplication']
}

type TopicMigrationTransform = Pick<TopicMigration, 'up' | 'down'>

const identityMigration: TopicMigrationTransform = {
  up: (value) => value,
  down: (value) => value,
}

function effectiveTopicVersions(
  migrations: ReadonlyMap<string, readonly TopicMigration[]>,
): Map<string, number> {
  const versions = new Map<string, number>()
  for (const [topic, steps] of migrations) {
    let version = 1
    for (const step of steps) if (step.to > version) version = step.to
    versions.set(topic, version)
  }
  return versions
}

function migrationTransformAt(
  steps: readonly TopicMigration[] | undefined,
  version: number,
  select: (step: TopicMigration) => TopicMigrationTransform | undefined,
): TopicMigrationTransform {
  const step = steps?.find((candidate) => candidate.from === version)
  return (step ? select(step) : undefined) ?? identityMigration
}

function migrateVersionedValue(
  steps: readonly TopicMigration[] | undefined,
  value: unknown,
  from: number,
  to: number,
  select: (step: TopicMigration) => TopicMigrationTransform | undefined,
): unknown {
  if (from === to) return value

  let current = value
  if (from < to) {
    for (let version = from; version < to; version++) {
      current = migrationTransformAt(steps, version, select).up(current)
    }
  } else {
    for (let version = from; version > to; version--) {
      current = migrationTransformAt(steps, version - 1, select).down(current)
    }
  }
  return current
}

/**
 * Creates adapters between the installed and application topic contracts.
 * @internal
 */
export function createTopicCompatibility(
  installedMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
  applicationMigrations: ReadonlyMap<string, readonly TopicMigration[]>,
): TopicCompatibility {
  const installedVersions = effectiveTopicVersions(installedMigrations)
  const applicationVersions = effectiveTopicVersions(applicationMigrations)
  const applicationVersion = (type: string) => applicationVersions.get(type) ?? 1
  const installedVersion = (type: string) => installedVersions.get(type) ?? 1
  const migrationChainFor = (type: string) =>
    (applicationVersion(type) > installedVersion(type)
      ? applicationMigrations
      : installedMigrations
    ).get(type)
  const createVersionAdapter = (
    select: (step: TopicMigration) => TopicMigrationTransform | undefined,
  ): TopicVersionAdapter => ({
    toInstalled: (type, value) =>
      migrateVersionedValue(
        migrationChainFor(type),
        value,
        applicationVersion(type),
        installedVersion(type),
        select,
      ),
    toApplication: (type, value) =>
      migrateVersionedValue(
        migrationChainFor(type),
        value,
        installedVersion(type),
        applicationVersion(type),
        select,
      ),
  })

  const stateValueAndEventPayload = createVersionAdapter((step) => step)
  const eventReply = createVersionAdapter((step) => step.reply)
  return {
    toInstalledEmission: stateValueAndEventPayload.toInstalled,
    toApplicationStateValue: stateValueAndEventPayload.toApplication,
    toApplicationEventPayload: stateValueAndEventPayload.toApplication,
    toInstalledEventReply: eventReply.toInstalled,
    toApplicationEventReply: eventReply.toApplication,
  }
}
