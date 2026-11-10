import { createHashRouter, Navigate } from 'react-router'
import { AssessPage } from '@/features/change/assess/AssessPage'
import { ComparePage } from '@/features/change/assess/ComparePage'
import { ItemDetail } from '@/features/change/assess/ItemDetail'
import { ChangeLayout } from '@/features/change/ChangeLayout'
import { ChangeListPage } from '@/features/change/ChangeListPage'
import { InitiateRevisionPage } from '@/features/change/InitiateRevisionPage'
import { OverviewPage } from '@/features/change/OverviewPage'
import { ReviewPage } from '@/features/change/review/ReviewPage'
import { RolloutPage } from '@/features/change/rollout/RolloutPage'
import { TrainingPage } from '@/features/change/training/TrainingPage'
import { HomePage } from '@/features/home/HomePage'
import { DocumentDetailPage } from '@/features/library/DocumentDetailPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { AppLayout } from './AppLayout'
import { RouteError } from './RouteError'

// Three spaces (UX-43): 首页, 文件库, 变更 — a change has five tabs (UX-47).
export const router = createHashRouter([
  {
    path: '/',
    Component: AppLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: HomePage },
      { path: 'library', Component: LibraryPage },
      { path: 'library/:identity/:version', Component: DocumentDetailPage },
      { path: 'changes', Component: ChangeListPage },
      { path: 'changes/new', Component: InitiateRevisionPage },
      {
        path: 'changes/:id',
        Component: ChangeLayout,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', Component: OverviewPage },
          { path: 'assess', Component: AssessPage },
          { path: 'assess/compare', Component: ComparePage },
          { path: 'assess/doc/:identity', Component: ItemDetail },
          { path: 'revise', Component: ReviewPage },
          { path: 'rollout', Component: RolloutPage },
          { path: 'training', Component: TrainingPage },
        ],
      },
    ],
  },
])
