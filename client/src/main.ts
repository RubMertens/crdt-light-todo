import './style.css'
import { v4 as uuid } from 'uuid'
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr'
import { Change, ChangeSet, getObject, LWWRegister, State, stateToChangeSet } from './lww/LWWRegister'
// import { LWWRegister } from './LWWRegister'
const serverUrl = 'https://localhost:7254'

//object -> property -> value
//how to handle lists?
//object -> property:type -> "entityType"
//store -> getAll objects with property == value
//have list objects which contain the entities in the lists
//have navigational thingies --> object-> todo list -> property:key = value:key

interface Todo {
  completed: boolean
  text: string
  id: string
}
interface Project {
  todos: Record<string, Todo>
}

type ChangeHandler = (state: State, set: ChangeSet) => void

class ChangePipeline {
  private handlers: ChangeHandler[] = []
  private lww = new LWWRegister()

  private unconfirmedChanges: Change[] = []
  private unconfirmedAdds: string[] = []

  constructor(private connection: HubConnection) {}

  public start() {
    const changeBuffer: ChangeSet[] = []
    let hasReceivedState = false
    let signalLoaded: Function
    const initialDataSetup = new Promise<void>((res) => {
      signalLoaded = res
    })
    this.connection.on('receiveChanges', (set: ChangeSet) => {
      if (!hasReceivedState) {
        changeBuffer.push(set)
      } else {
        this.handleServerChangeSet(set)
      }
    })
    this.connection.on('initialState', (state: State) => {
      const initialChangeSet = stateToChangeSet(state)
      console.log('received initial state', initialChangeSet)

      this.handleServerChangeSet(initialChangeSet)

      for (const set of changeBuffer) {
        this.handleServerChangeSet(set)
      }
      hasReceivedState = true
      signalLoaded()
    })

    return Promise.all([initialDataSetup, this.connection.start()])
  }

  public getCurrentState(): State {
    return this.lww.getState()
  }

  private handleServerChangeSet(set: ChangeSet) {
    console.log('server sent', set)
    const filteredSet: ChangeSet = {
      adds: [],
      changes: [],
      removes: [],
    }
    for (const add of set.adds) {
      const uaI = this.unconfirmedAdds.findIndex((ua) => ua === add)
      if (uaI > -1) {
        console.log('confirming add for', this.unconfirmedAdds[uaI])
        this.unconfirmedAdds.splice(uaI, 1)
      } else {
        filteredSet.adds.push(add)
      }
    }
    for (const change of set.changes) {
      const ucI = this.unconfirmedChanges.findIndex((uc) => uc.key === change.key && uc.property === change.property)
      if (ucI > -1) {
        //found an unconfirmed change
        //find and remove it when the value matches
        const uc = this.unconfirmedChanges[ucI]
        if (change.value === uc?.value) {
          console.log('confirmed change ', change)
          this.unconfirmedChanges.splice(ucI, 1)
        }
        //else ignore the change for now and assume your local state is right!
      } else {
        filteredSet.changes.push(change)
      }
    }
    filteredSet.removes = set.removes

    this.lww.handleAdd(filteredSet.adds)
    this.lww.handleChanges(filteredSet.changes)
    this.lww.handleRemove(filteredSet.removes)

    const state = this.lww.getState()
    for (const h of this.handlers) {
      h(state, filteredSet)
    }
    console.log('after server state', structuredClone(state))
  }

  public handleChangeSet(set: ChangeSet) {
    this.lww.handleAdd(set.adds)
    this.lww.handleChanges(set.changes)
    this.lww.handleRemove(set.removes)
    this.unconfirmedChanges = [...this.unconfirmedChanges, ...set.changes]
    this.unconfirmedAdds = [...this.unconfirmedAdds, ...set.adds]
    const state = this.lww.getState()
    for (const h of this.handlers) {
      h(state, set)
    }
    console.log('after local changes', state)
    this.connection.send('SendChanges', set)
  }

  public RegisterChangeHandler(fn: ChangeHandler) {
    this.handlers.push(fn)
    const state = this.lww.getState()
    fn(state, stateToChangeSet(state))
  }
}

const renderTodo = (t: Todo, onCheckbox: (checked: boolean) => void, onRemove: () => void) => {
  const html = `
  <div data-todoId="${t.id}">
    <input type="checkbox" ${t.completed ? 'checked' : ''} /> <span>${
    t.text
  }</span> <button class="remove-todo">X</button>
  </div>
  `
  const todos = document.getElementById('todos')!
  const node = new DOMParser().parseFromString(html, 'text/html').body.firstChild
  todos.appendChild(node!)
  //add handlers after apending to DOM
  ;(todos.querySelector(`[data-todoId='${t.id}']`) as HTMLInputElement).onchange = (e) => {
    console.log('change event', e)
    onCheckbox((e.target as HTMLInputElement).checked)
  }
  ;(todos.querySelector(`[data-todoId='${t.id}'] button`) as HTMLButtonElement).onclick = (e) => {
    onRemove()
  }
}
const updateChecked = (t: Todo) => {
  const cb = document.querySelector(`[data-todoId='${t.id}'] input`) as HTMLInputElement
  console.log('setting ', cb, 'checked to ', t.completed)
  cb.checked = t.completed
  // cb?.dispatchEvent(new Event('change'))
}

const todoReducer = (state: State, id: string): Todo | undefined => {
  console.log('checking against', state[id], state, id)
  if (!(state[id]?.type === 'todo')) return undefined
  return {
    id: state[id].id,
    completed: state[id].completed,
    text: state[id].text,
  }
}

const printState = (state: State) => {
  const json = JSON.stringify(state, null, 2)
  document.getElementById('state')!.innerText = json
}

window.onload = async () => {
  console.log('loaded')
  const connection = new HubConnectionBuilder().withUrl(`${serverUrl}/connect`).withAutomaticReconnect().build()
  const pipeline = new ChangePipeline(connection)
  await pipeline.start()
  console.log('pipelinestarted')
  pipeline.RegisterChangeHandler((state, cs) => {
    for (const addedId of cs.adds) {
      const todo = todoReducer(state, addedId)
      console.log('trying to render todo', todo, state, cs)
      if (todo) {
        console.log('todo', todo)
        renderTodo(todo, (checked) => {
          console.log('toggling check for', todo.id, 'to', checked)
          pipeline.handleChangeSet({
            adds: [],
            changes: [
              {
                key: todo.id,
                property: 'completed',
                value: checked,
              },
            ],
            removes: [],
          })
        })
      }
    }
    for (const changes of cs.changes) {
      const todo = todoReducer(state, changes.key)
      if (todo) {
        updateChecked(todo)
      }
    }
    for (const removes of cs.removes) {
    }
  })

  pipeline.RegisterChangeHandler((state) => {
    printState(state)
  })
  const todoInput = document.getElementById('text-todo')! as HTMLInputElement

  const listExists = getObject(pipeline.getCurrentState(), 'todos')
  if (!listExists) {
    pipeline.handleChangeSet({
      adds: ['todos'],
      changes: [],
      removes: [],
    })
  }

  document.getElementById('add-todo')!.onclick = () => {
    const todoId = uuid() //generate new todoId
    const state = pipeline.getCurrentState()

    let todoIds = Object.values(state['todos'])
    const otherFound = todoIds.find((tId) => state[tId].text === todoInput.value)
    if (otherFound) {
      console.log('other found, not adding todo')
      return
    }
    const cs: ChangeSet = {
      adds: [todoId],
      removes: [],
      changes: [
        {
          key: todoId,
          property: 'id',
          value: todoId,
        },
        {
          key: todoId,
          property: 'completed',
          value: false,
        },
        {
          key: todoId,
          property: 'text',
          value: todoInput.value,
        },
        {
          key: 'todos',
          property: todoId,
          value: todoId,
        },
        { key: todoId, property: 'type', value: 'todo' },
      ],
    }
    pipeline.handleChangeSet(cs)
    todoInput.value = ''
  }
}
