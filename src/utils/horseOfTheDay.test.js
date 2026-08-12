import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHorseOfTheDay } from './horseOfTheDay.js'

function race(id, offTime, runners) {
  return { id, course: `Course ${id}`, raceName: `Race ${id}`, offTime, runners }
}

test('null for missing or empty input', () => {
  assert.equal(computeHorseOfTheDay(null), null)
  assert.equal(computeHorseOfTheDay(undefined), null)
  assert.equal(computeHorseOfTheDay([]), null)
})

test('null when no runner has a usable speed figure', () => {
  const races = [race('r1', '2026-08-12T14:00:00Z', [{ id: 'h1', name: 'Nofigure', speedFigure: null }])]
  assert.equal(computeHorseOfTheDay(races), null)
})

test('ignores zero, negative, and non-numeric figures', () => {
  const races = [
    race('r1', '2026-08-12T14:00:00Z', [
      { id: 'h1', name: 'Zero', speedFigure: 0 },
      { id: 'h2', name: 'Negative', speedFigure: -5 },
      { id: 'h3', name: 'Junk', speedFigure: 'n/a' },
      { id: 'h4', name: 'Real', speedFigure: 82 }
    ])
  ]
  assert.equal(computeHorseOfTheDay(races).horseName, 'Real')
})

test('picks the single highest figure across multiple races', () => {
  const races = [
    race('r1', '2026-08-12T14:00:00Z', [{ id: 'h1', name: 'Slower', speedFigure: 90 }]),
    race('r2', '2026-08-12T15:00:00Z', [{ id: 'h2', name: 'Faster', speedFigure: 105 }])
  ]
  const result = computeHorseOfTheDay(races)
  assert.equal(result.horseName, 'Faster')
  assert.equal(result.raceId, 'r2')
  assert.equal(result.speedFigure, 105)
})

test('coerces numeric strings (the racing API returns figures as strings)', () => {
  const races = [race('r1', '2026-08-12T14:00:00Z', [{ id: 'h1', name: 'Stringy', speedFigure: '97' }])]
  assert.equal(computeHorseOfTheDay(races).speedFigure, 97)
})

test('ties break on earliest off-time', () => {
  const races = [
    race('later', '2026-08-12T16:00:00Z', [{ id: 'h1', name: 'Later', speedFigure: 100 }]),
    race('earlier', '2026-08-12T13:00:00Z', [{ id: 'h2', name: 'Earlier', speedFigure: 100 }])
  ]
  assert.equal(computeHorseOfTheDay(races).horseName, 'Earlier')
})

test('carries jockey/trainer/course/raceName through, nulling missing jockey/trainer', () => {
  const races = [
    race('r1', '2026-08-12T14:00:00Z', [{ id: 'h1', name: 'Solo', speedFigure: 88, jockey: 'J Smith', trainer: undefined }])
  ]
  const result = computeHorseOfTheDay(races)
  assert.equal(result.jockey, 'J Smith')
  assert.equal(result.trainer, null)
  assert.equal(result.course, 'Course r1')
  assert.equal(result.raceName, 'Race r1')
})
