import {SanityDocument} from '@sanity/types'
import {listen} from './listen'
import {getPublishedId} from './drafts'
import {applyPatchWithoutRev} from './patch'
import {Config, EnvImplementations, MutationEvent, Subscription} from './types'

function noop() {
  // intentional noop
}

export function getSyncingDataset(
  config: Config,
  onNotifyUpdate: (docs: SanityDocument[]) => void,
  {getDocuments, EventSource}: EnvImplementations
): Subscription & {loaded: Promise<void>} {
  const {projectId, dataset, listen: useListener, overlayDrafts} = config

  if (!useListener) {
    const loaded = getDocuments(projectId, dataset).then(onUpdate).then(noop)
    return {unsubscribe: noop, loaded}
  }

  const indexedDocuments = new Map<string, SanityDocument>()

  // undefined until the listener has been set up and the initial export is done
  let documents: SanityDocument[] | undefined

  // holds any mutations that happen while fetching documents so they can be applied after updates
  const buffer: MutationEvent[] = []

  // Return a promise we can resolve once we've established a listener and reconciled any mutations
  let onDoneLoading: () => void
  const loaded = new Promise<void>((resolve) => {
    onDoneLoading = resolve
  })

  const listener = listen(EventSource, config, {
    next: onMutationReceived,
    open: onOpen,
    error: () => null,
  })

  return {unsubscribe: listener.unsubscribe, loaded}

  async function onOpen() {
    const initial = await getDocuments(projectId, dataset)
    documents = applyBufferedMutations(initial, buffer)
    documents.forEach((doc) => indexedDocuments.set(doc._id, doc))
    onUpdate(documents)
    onDoneLoading()
  }

  function onMutationReceived(msg: MutationEvent) {
    if (documents) {
      applyMutation(msg)
      onUpdate(documents)
    } else {
      buffer.push(msg)
    }
  }

  function onUpdate(docs: SanityDocument[]) {
    onNotifyUpdate(overlayDrafts ? overlay(docs) : docs)
  }

  function applyMutation(msg: MutationEvent) {
    if (!msg.effects || msg.documentId.startsWith('_.')) {
      return
    }

    const document = indexedDocuments.get(msg.documentId) || null
    replaceDocument(msg.documentId, applyPatchWithoutRev(document, msg.effects.apply))
  }

  function replaceDocument(id: string, document: SanityDocument | null) {
    const current = indexedDocuments.get(id)
    const docs = documents || []
    const position = current ? docs.indexOf(current) : -1

    if (position === -1 && document) {
      // Didn't exist previously, but was now created. Add it.
      docs.push(document)
      indexedDocuments.set(id, document)
    } else if (document) {
      // Existed previously and still does. Replace it.
      docs.splice(position, 1, document)
      indexedDocuments.set(id, document)
    } else {
      // Existed previously, but is now deleted. Remove it.
      docs.splice(position, 1)
      indexedDocuments.delete(id)
    }
  }
}

function applyBufferedMutations(
  documents: SanityDocument[],
  mutations: MutationEvent[]
): SanityDocument[] {
  // Group by document ID
  const groups = new Map<string, MutationEvent[]>()
  mutations.forEach((mutation) => {
    const group = groups.get(mutation.documentId) || []
    group.push(mutation)
    groups.set(mutation.documentId, group)
  })

  // Discard all mutations that happened before our current document
  groups.forEach((group, id) => {
    const document = documents.find((doc) => doc._id === id)
    if (!document) {
      // @todo handle
      // eslint-disable-next-line no-console
      console.warn('Received mutation for missing document')
      return
    }

    // Mutations are sorted by timestamp, apply any that arrived after
    // we fetched the initial documents
    let hasFoundRevision = false
    let current: SanityDocument | null = document
    group.forEach((mutation) => {
      hasFoundRevision = hasFoundRevision || mutation.previousRev === document._rev
      if (!hasFoundRevision) {
        return
      }

      if (mutation.effects) {
        current = applyPatchWithoutRev(current, mutation.effects.apply)
      }
    })

    // Replace the indexed documents
    documents.splice(documents.indexOf(document), 1, current)
  })

  return documents
}

function overlay(documents: SanityDocument[]): SanityDocument[] {
  const overlayed = new Map<string, SanityDocument>()

  documents.forEach((doc) => {
    const existing = overlayed.get(getPublishedId(doc))
    if (doc._id.startsWith('drafts.')) {
      // Drafts always overlay
      overlayed.set(getPublishedId(doc), pretendThatItsPublished(doc))
    } else if (!existing) {
      // Published documents only override if draft doesn't exist
      overlayed.set(doc._id, doc)
    }
  })

  return Array.from(overlayed.values())
}

// Strictly speaking it would be better to allow groq-js to resolve `draft.<id>`,
// but for now this will have to do
function pretendThatItsPublished(doc: SanityDocument): SanityDocument {
  return {...doc, _id: getPublishedId(doc)}
}
