import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <pre className="whitespace-pre-wrap rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-xs text-rose-700 dark:text-rose-300">
          {this.state.error.stack ?? this.state.error.message}
        </pre>
      )
    }
    return this.props.children
  }
}
