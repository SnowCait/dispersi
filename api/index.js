import 'websocket-polyfill'
import { SimplePool, getEventHash, getPublicKey, getSignature, nip19 } from 'nostr-tools'

const relays = [
  'wss://relay.nostr.band/',
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr-relay.nokotaro.com',
  'wss://nostream.ocha.one'
]
const regexp = /(?<x>[a-h])(?<y>[1-8])/
const boardSize = 8

export const handler = async (e) => {
  console.log('[request]', JSON.stringify(e))
  const json = e.isBase64Encoded ? Buffer.from(e.body, 'base64').toString() : e.body
  console.log('[request event]', json)

  const requestEvent = JSON.parse(json)

  const nsec = await getNsec('nostr-test-bot-nsec')
  const { type, data: seckey } = nip19.decode(nsec)

  if (type !== 'nsec' || typeof seckey !== 'string') {
    throw new Error(`[invalid nsec] type: ${type}, typeof seckey: ${typeof seckey}`)
  }

  const pubkey = getPublicKey(seckey)

  const boardEvent = await fetchReplyToEvent(requestEvent)
  console.log('[board event]', boardEvent)

  let event
  if (boardEvent === null || boardEvent.pubkey !== pubkey) {
    console.log('[start game]')
    event = startGame(pubkey, requestEvent)
  } else if (regexp.test(requestEvent.content)) {
    console.log('[continue game]')
    event = continueGame(pubkey, requestEvent, boardEvent)
  } else {
    console.log('[help]')
    event = help(pubkey, requestEvent)
  }

  event.id = getEventHash(event)
  event.sig = getSignature(event, seckey)
  console.log('[event]', event)

  return {
    statusCode: 200,
    body: JSON.stringify(event)
  }
}

async function fetchReplyToEvent (event) {
  if (!event.tags.some(([tagName]) => tagName === 'e')) {
    // Root
    return null
  }

  let replyToId = event.tags.findLast(
    ([tagName, id, , marker]) => tagName === 'e' && id !== undefined && marker === 'reply'
  )?.at(1)

  // For regacy clients
  if (replyToId === undefined) {
    replyToId = event.tags.findLast(
      ([tagName, id]) => tagName === 'e' && id !== undefined
    )?.at(1)
  }

  if (replyToId === undefined) {
    // No reply
    return null
  }

  console.log('[reply to]', replyToId)
  console.log('[relays]', relays)

  const pool = new SimplePool()
  const replyToEvent = await pool.get(relays, {
    ids: [replyToId]
  })
  pool.close(relays)

  return replyToEvent
}

function startGame (pubkey, requestEvent) {
  const content = '' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 1\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 2\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 3\n' +
    '🟩🟩🟩⚪⚫🟩🟩🟩 4\n' +
    '🟩🟩🟩⚫⚪🟩🟩🟩 5\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 6\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 7\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 8\n' +
    ' ａ ｂ ｃ ｄ ｅ ｆ ｇ ｈ\n' +
    '\n' +
    'Next: ⚫'

  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', requestEvent.id, '', 'root'],
      ['p', requestEvent.pubkey]
    ],
    content,
    pubkey
  }

  return event
}

function continueGame (pubkey, requestEvent, boardEvent) {
  const cells = boardEvent.content.match(/🟩|⚪|⚫/g)
  console.log('[cells]', cells)

  if (cells.length !== boardSize * boardSize + 1) {
    throw new Error('Invalid board')
  }

  const next = cells.pop()
  const board = chunk(cells, boardSize)
  console.log('[board]', next, board)

  const match = requestEvent.content.match(regexp)
  const { x, y } = match.groups
  console.log('[put]', x, y)

  const xs = Array.from({ length: boardSize }, (v, i) => String.fromCharCode(i + 'a'.charCodeAt(0)))
  board[Number(y) - 1][xs.indexOf(x)] = next

  console.log('[next board]', board)

  const content = board.map((row, i) => row.join('') + ` ${i + 1}`).join('\n') + '\n' +
    ' ａ ｂ ｃ ｄ ｅ ｆ ｇ ｈ\n' +
    '\n' +
    'Next: ' + (next === '⚫' ? '⚪' : '⚫')

  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', requestEvent.id, '', 'reply'],
      ['p', requestEvent.pubkey]
    ],
    content,
    pubkey
  }

  return event
}

function help (pubkey, requestEvent) {
  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', requestEvent.id, '', 'reply'],
      ['p', requestEvent.pubkey]
    ],
    content: 'Something wrong.',
    pubkey
  }

  return event
}

function chunk (array, length) {
  return Array.from({ length: Math.ceil(array.length / length) }, (v, i) => {
    return array.slice(i * length, i * length + length)
  })
}

async function getNsec (name) {
  const response = await fetch(`http://localhost:2773/systemsmanager/parameters/get?name=${name}&withDecryption=true`, {
    method: 'GET',
    headers: {
      'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN
    }
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const secrets = await response.json()
  return secrets.Parameter.Value
}
