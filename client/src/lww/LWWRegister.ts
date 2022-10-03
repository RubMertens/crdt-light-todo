export type State = Record<string, Record<string, any>>

export const getObject = (state: State, key: string) => {
  return state[key]
}
export const stateToChangeSet = (state: State): ChangeSet => {
  const mappedChanges = Object.entries(state).flatMap(([key, properties]) => {
    return Object.entries(properties).map(([property, value]) => ({ key, property, value } as Change))
  })
  return {
    adds: Object.keys(state),
    changes: mappedChanges,
    removes: [],
  }
}

export class LWWRegister {
  private state: State = {}

  public takeState(state: State) {
    this.state = state
  }

  //return a clone of the current project state
  public getState() {
    return structuredClone(this.state)
  }
  public handleAdd(adds: string[]) {
    for (const add of adds) {
      if (!this.state[add]) {
        this.state[add] = {}
      }
    }
  }

  public handleRemove(removes: string[]) {
    for (const remove of removes) {
      console.log('removing', remove)
      delete this.state[remove]
    }
  }

  public handleChanges(changes: Change[]) {
    for (const c of changes) {
      this.handleChange(c)
    }
  }

  public handleChange({ key, property, value }: Change) {
    if (this.state[key]) {
      this.state[key][property] = value
    }
  }
}

export interface ChangeSet {
  adds: string[]
  removes: string[]
  changes: Change[]
}

export interface Change {
  key: string
  property: string
  value: any
}
