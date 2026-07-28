import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { CapacityStatus } from '../types'
import { Avatar, CapacityDot } from './Avatar'
import { Popover } from './Popover'

const CAPACITY_OPTIONS: { status: CapacityStatus; label: string; dot: string }[] = [
  { status: 'green', label: 'Green', dot: 'bg-emerald-500' },
  { status: 'yellow', label: 'Yellow', dot: 'bg-amber-500' },
  { status: 'red', label: 'Red', dot: 'bg-rose-500' },
]

function UserEditPanel({ userId, close }: { userId: string; close: () => void }) {
  const user = useAppStore((s) => s.users.find((u) => u.id === userId))
  const setCapacity = useAppStore((s) => s.setCapacity)
  const renameUser = useAppStore((s) => s.renameUser)
  const setUserActive = useAppStore((s) => s.setUserActive)
  const [name, setName] = useState(user?.name ?? '')
  const [note, setNote] = useState(user?.capacity.note ?? '')

  if (!user) return null

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <label className="mb-1 block text-xs text-black/50 dark:text-white/50">Name</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
          />
          <button
            onClick={() => name.trim() && renameUser(user.id, name.trim())}
            className="shrink-0 rounded-md border border-black/15 px-2 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Save
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-black/50 dark:text-white/50">Day-job capacity</label>
        <div className="flex gap-1.5">
          {CAPACITY_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              onClick={() => setCapacity(user.id, opt.status, note.trim() || null)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                user.capacity.status === opt.status
                  ? 'border-black/40 bg-black/5 dark:border-white/40 dark:bg-white/10'
                  : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-black/50 dark:text-white/50">Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Quarter-end reporting until Aug 8"
          className="w-full rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
          onBlur={() => setCapacity(user.id, user.capacity.status, note.trim() || null)}
        />
      </div>

      <button
        onClick={() => {
          setUserActive(user.id, false)
          close()
        }}
        className="self-start text-xs text-rose-600/80 hover:text-rose-700 dark:text-rose-400/80 dark:hover:text-rose-300"
      >
        Mark as inactive
      </button>
    </div>
  )
}

function AddTeammatePanel({ close }: { close: () => void }) {
  const addUser = useAppStore((s) => s.addUser)
  const [name, setName] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        addUser(name.trim())
        setName('')
        close()
      }}
      className="flex flex-col gap-2 text-sm"
    >
      <label className="text-xs text-black/50 dark:text-white/50">Teammate name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sam Rivera"
        className="rounded-md border border-black/15 bg-black/[0.03] px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black/30 dark:focus:border-white/40"
      />
      <button
        type="submit"
        className="self-start rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        Add
      </button>
    </form>
  )
}

export function TeamBar() {
  const allUsers = useAppStore((s) => s.users)
  const users = allUsers.filter((u) => u.active)

  return (
    <div className="flex flex-wrap items-center gap-3">
      {users.map((user) => (
        <Popover
          key={user.id}
          trigger={(open) => (
            <button
              onClick={open}
              className="flex items-center gap-2 rounded-full border border-black/15 py-1 pl-1 pr-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              <Avatar user={user} />
              <span className="text-sm">{user.name}</span>
              <CapacityDot status={user.capacity.status} />
            </button>
          )}
        >
          {(close) => <UserEditPanel userId={user.id} close={close} />}
        </Popover>
      ))}

      <Popover
        trigger={(open) => (
          <button
            onClick={open}
            className="flex items-center gap-1 rounded-full border border-dashed border-black/20 px-3 py-1.5 text-sm text-black/60 hover:bg-black/5 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/5"
          >
            + Add teammate
          </button>
        )}
      >
        {(close) => <AddTeammatePanel close={close} />}
      </Popover>
    </div>
  )
}
