## Proposed API

```ts
import {MemQuery} from '@sanity/memquery'

const dataset = new MemQuery({
  projectId: 'abc123',
  dataset: 'blog',
  listen: true,
  overlayDrafts: true,
})

dataset.query('*[_type == "author"]').then((docs) => {
  console.log(docs)
})

dataset.getDocument('grrm').then((grrm) => {
  console.log(grrm)
})

dataset.getDocuments(['grrm', 'jrrt']).then(([grrm, jrrt]) => {
  console.log(grrm, jrrt)
})

const sub = dataset
  .liveQuery(
    groq`
    *[_type == "author"][0...3] {
      name,
      books[]->{
        title,
        releaseDate
      }
    }
`
  )
  .subscribe((result) => {
    console.log(result)
  })

// Later, to close live query:
sub.unsubscribe()

// Later, to close listener:
dataset.close()
```
