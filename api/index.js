import { getEventHash, getPublicKey, getSignature, nip19 } from 'nostr-tools'

export const handler = async (e) => {
  console.log('[request]', JSON.stringify(e))
  const json = e.isBase64Encoded ? Buffer.from(e.body, 'base64').toString() : e.body
  console.log('[request event]', json)

  const requestEvent = JSON.parse(json)

  const content = '' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 1\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 2\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 3\n' +
    '🟩🟩🟩⚪⚫🟩🟩🟩 4\n' +
    '🟩🟩🟩⚫⚪🟩🟩🟩 5\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 6\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 7\n' +
    '🟩🟩🟩🟩🟩🟩🟩🟩 8\n' +
    ' ａ ｂ ｃ ｄ ｅ ｆ ｇ ｈ'

  const nsec = await getNsec('nostr-test-bot-nsec')
  const { type, data: seckey } = nip19.decode(nsec)

  if (type !== 'nsec' || typeof seckey !== 'string') {
    throw new Error(`[invalid nsec] type: ${type}, typeof seckey: ${typeof seckey}`)
  }

  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', requestEvent.id, '', 'root'],
      ['p', requestEvent.pubkey]
    ],
    content,
    pubkey: getPublicKey(seckey)
  }

  event.id = getEventHash(event)
  event.sig = getSignature(event, seckey)

  console.log('[event]', event)

  return {
    statusCode: 200,
    body: JSON.stringify(event)
  }
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
