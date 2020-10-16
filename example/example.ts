import {memQuery, Subscription} from '../src'

//
;(function () {
  // Yep
  const queryEl = document.getElementById('query') as HTMLTextAreaElement
  const resultEl = document.getElementById('result') as HTMLTextAreaElement
  const clearBtnEl = document.getElementById('clear') as HTMLButtonElement
  const executeBtnEl = document.getElementById('execute') as HTMLButtonElement
  const subscribeBtnEl = document.getElementById('subscribe') as HTMLButtonElement

  attach()

  let subscription: Subscription | undefined
  const dataset = memQuery({projectId: 'memquery', dataset: 'fixture'})

  function attach() {
    clearBtnEl.addEventListener('click', clear, false)
    executeBtnEl.addEventListener('click', execute, false)
    subscribeBtnEl.addEventListener('click', subscribe, false)
    queryEl.addEventListener('keyup', onKeyUp, false)
  }

  async function execute() {
    resultEl.value = '… querying …'
    onResult(await dataset.query(queryEl.value))
  }

  function subscribe() {
    if (subscription) {
      subscription.unsubscribe()
      subscription = null
      subscribeBtnEl.textContent = 'Subscribe'
      executeBtnEl.disabled = false
      clear()
    } else {
      resultEl.value = '… querying …'
      executeBtnEl.disabled = true
      subscribeBtnEl.textContent = 'Unsubscribe'
      subscription = dataset.subscribe(queryEl.value, {}, onResult)
    }
  }

  function onResult(queryResult: any) {
    const json = JSON.stringify(queryResult, null, 2)
    resultEl.value = json
  }

  function onKeyUp(evt: KeyboardEvent) {
    if (evt.ctrlKey && evt.key === 'Enter') {
      execute()
    }
  }

  function clear() {
    resultEl.value = ''
  }
})()
