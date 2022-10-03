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

export class LWWRegister {
  private state: any = {}

  public applyChangeSet(changeSet: ChangeSet) {
    this.handleAdd(changeSet.adds)
    this.handleChanges(changeSet.changes)
    this.handleRemoves(changeSet.removes)
    console.log(this.state)
  }

  public handleAdd(adds: string[]) {
    for (const add of adds) {
      this.state[add] = {}
    }
  }

  public handleChanges(changes: Change[]) {
    for (const change of changes) {
      this.updateJsonGraph(change)
    }
  }

  public handleRemoves(removes: string[]) {
    for (const remove of removes) {
      delete this.state[remove]
    }
  }

  public updateJsonGraph({ key, property, value }: Change) {
    const split = key.split('.')
    console.log(split)
    let leafReference = split.reduce((acc, subKey) => {
      if (!acc[subKey]) {
        acc[subKey] = {}
      }
      return acc[subKey]
    }, this.state)
    console.log(leafReference)
    leafReference[property] = value
  }
  public toJs() {
    return structuredClone(this.state)
  }
}
