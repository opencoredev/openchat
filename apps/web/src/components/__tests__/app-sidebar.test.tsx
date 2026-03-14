// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useParams: vi.fn(() => ({})),
}))

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => undefined),
}))

vi.mock('@server/convex/_generated/api', () => ({
  api: {
    users: { getByExternalId: 'users:getByExternalId' },
    chats: {
      list: 'chats:list',
      remove: 'chats:remove',
      removeBulk: 'chats:removeBulk',
      setTitle: 'chats:setTitle',
      setGeneratedTitle: 'chats:setGeneratedTitle',
      generateTitle: 'chats:generateTitle',
    },
    messages: { getFirstUserMessage: 'messages:getFirstUserMessage' },
  },
}))

// Critical: convexClient must be truthy — component uses `convexClient && user?.id ? args : "skip"`
// A null convexClient causes all queries to skip and triggers loading state
vi.mock('@/lib/convex', () => ({
  convexClient: { mutation: vi.fn(), query: vi.fn(), action: vi.fn() },
}))

vi.mock('@/lib/auth-client', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

vi.mock('@/stores/provider', () => ({
  useProviderStore: vi.fn((selector: (s: any) => any) =>
    selector({ activeProvider: 'osschat' }),
  ),
}))

vi.mock('@/stores/chat-title', () => ({
  useChatTitleStore: vi.fn((selector: (s: any) => any) =>
    selector({
      length: 'standard',
      confirmDelete: true,
      generatingChatIds: {},
      setGenerating: vi.fn(),
    }),
  ),
}))

vi.mock('@/stores/bulk-selection', () => ({
  useBulkSelectionStore: vi.fn((selector: (s: any) => any) =>
    selector({
      selectedChatIds: new Set<string>(),
      selectChat: vi.fn(),
      selectAll: vi.fn(),
      deselectAll: vi.fn(),
      getSelectedChatIds: vi.fn().mockReturnValue([]),
    }),
  ),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

// useSidebar throws without SidebarProvider — mock the whole sidebar module
vi.mock('../ui/sidebar', () => ({
  useSidebar: vi.fn(() => ({
    open: true,
    isMobile: false,
    setOpen: vi.fn(),
    setOpenMobile: vi.fn(),
  })),
  Sidebar: ({ children }: any) => <div data-testid="sidebar">{children}</div>,
  SidebarContent: ({ children }: any) => (
    <div data-testid="sidebar-content">{children}</div>
  ),
  SidebarFooter: ({ children }: any) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
  SidebarGroup: ({ children }: any) => (
    <div data-testid="sidebar-group">{children}</div>
  ),
  SidebarGroupLabel: ({ children }: any) => (
    <div data-testid="sidebar-group-label">{children}</div>
  ),
  SidebarMenu: ({ children }: any) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  // Filter `isActive` to avoid unknown DOM prop warning
  SidebarMenuButton: ({ children, isActive: _isActive, ...props }: any) => (
    <button data-testid="sidebar-menu-button" {...props}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: any) => (
    <div data-testid="sidebar-menu-item">{children}</div>
  ),
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="alert-dialog">
        {children}
        <button
          data-testid="dialog-dismiss"
          onClick={() => onOpenChange?.(false)}
        >
          dismiss
        </button>
      </div>
    ) : null,
  AlertDialogContent: ({ children }: any) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => (
    <div data-testid="alert-dialog-title">{children}</div>
  ),
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('@/components/icons', () => ({
  ChevronRightIcon: () => <span data-testid="chevron-right-icon" />,
  MenuIcon: () => <span data-testid="menu-icon" />,
  PlusIcon: () => <span data-testid="plus-icon" />,
  SidebarIcon: () => <span data-testid="sidebar-icon" />,
}))

vi.mock('lucide-react', () => ({
  GitForkIcon: () => <span data-testid="git-fork-icon" />,
  ImageIcon: () => <span data-testid="image-icon" />,
  MessageSquareIcon: () => <span data-testid="message-square-icon" />,
  PencilIcon: () => <span data-testid="pencil-icon" />,
  SparklesIcon: () => <span data-testid="sparkles-icon" />,
  Trash2Icon: () => <span data-testid="trash2-icon" />,
  XIcon: () => <span data-testid="x-icon" />,
}))

vi.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { AppSidebar } from '../app-sidebar'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useAuth } from '@/lib/auth-client'
import { useBulkSelectionStore } from '@/stores/bulk-selection'
import { useSidebar } from '../ui/sidebar'

const TODAY = Date.now()
const THREE_DAYS_AGO = Date.now() - 3 * 24 * 60 * 60 * 1000

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@test.com',
  image: null as string | null,
}
const mockConvexUser = { _id: 'convex-user-1' as any }

const todayChat = {
  _id: 'chat-1' as any,
  title: 'Chat about AI',
  updatedAt: TODAY,
}
const anotherTodayChat = {
  _id: 'chat-2' as any,
  title: 'React hooks discussion',
  updatedAt: TODAY,
}
const lastWeekChat = {
  _id: 'chat-3' as any,
  title: 'Old discussion',
  updatedAt: THREE_DAYS_AGO,
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    vi.mocked(useQuery).mockReturnValue(undefined as any)
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
    vi.mocked(useParams).mockReturnValue({} as any)
    vi.mocked(useSidebar).mockReturnValue({
      open: true,
      isMobile: false,
      setOpen: vi.fn(),
      setOpenMobile: vi.fn(),
    } as any)
    ;(vi.mocked(useBulkSelectionStore) as any).mockImplementation(
      (selector: (s: any) => any) =>
        selector({
          selectedChatIds: new Set<string>(),
          selectChat: vi.fn(),
          selectAll: vi.fn(),
          deselectAll: vi.fn(),
          getSelectedChatIds: vi.fn().mockReturnValue([]),
        }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders without crashing when unauthenticated', () => {
    const { container } = render(<AppSidebar />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders New Chat buttons (sidebar + collapsed floating bar)', () => {
    render(<AppSidebar />)
    const btns = screen.getAllByRole('button', { name: /new chat/i })
    expect(btns.length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to "/" when the sidebar New Chat button is clicked', () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)
    fireEvent.click(screen.getByText('New Chat'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('shows "No chats yet" empty state when authenticated but chat list is empty', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [] } as any)
    render(<AppSidebar />)
    expect(screen.getByText('No chats yet')).toBeTruthy()
  })

  it('renders chat titles when chats are available', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat, anotherTodayChat] } as any)
    render(<AppSidebar />)
    expect(screen.getByText('Chat about AI')).toBeTruthy()
    expect(screen.getByText('React hooks discussion')).toBeTruthy()
  })

  it('shows "Today" group label for chats updated today', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat] } as any)
    render(<AppSidebar />)
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('shows "Last 7 days" group label for chats from the past week', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [lastWeekChat] } as any)
    render(<AppSidebar />)
    expect(screen.getByText('Last 7 days')).toBeTruthy()
  })

  it('shows bulk selection bar with count and Delete button when chats are selected', () => {
    const selectedIds = new Set(['chat-1', 'chat-2'])
    ;(vi.mocked(useBulkSelectionStore) as any).mockImplementation(
      (selector: (s: any) => any) =>
        selector({
          selectedChatIds: selectedIds,
          selectChat: vi.fn(),
          selectAll: vi.fn(),
          deselectAll: vi.fn(),
          getSelectedChatIds: vi.fn().mockReturnValue(['chat-1', 'chat-2']),
        }),
    )
    render(<AppSidebar />)
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy()
  })

  it('shows the compact settings avatar button when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(null as any)
      .mockReturnValueOnce(undefined as any)
    render(<AppSidebar />)
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy()
  })

  it('does not show user profile section when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    render(<AppSidebar />)
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
  })

  it('renders the mobile menu button (hamburger)', () => {
    render(<AppSidebar />)
    const menuBtn = screen.getByRole('button', { name: /open menu/i })
    expect(menuBtn).toBeTruthy()
  })

  it('renders a delete button for each chat item', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat, anotherTodayChat] } as any)
    render(<AppSidebar />)
    const deleteButtons = screen.getAllByRole('button', {
      name: /delete chat/i,
    })
    expect(deleteButtons.length).toBe(2)
  })

  it('calls setOpenMobile when mobile menu button is clicked on mobile', () => {
    const mockSetOpenMobile = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: false,
      isMobile: true,
      setOpen: vi.fn(),
      setOpenMobile: mockSetOpenMobile,
    } as any)
    render(<AppSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(mockSetOpenMobile).toHaveBeenCalledWith(true)
  })

  it('clicking a chat item navigates to /c/$chatId', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat] } as any)
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)
    const chatBtns = screen.getAllByTestId('sidebar-menu-button')
    fireEvent.click(chatBtns[0])
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/c/$chatId',
      params: { chatId: 'chat-1' },
    })
  })

  it('clicking a chat item on mobile calls setOpenMobile(false) then navigates', () => {
    const mockSetOpenMobile = vi.fn()
    const mockNavigate = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: true,
      isMobile: true,
      setOpen: vi.fn(),
      setOpenMobile: mockSetOpenMobile,
    } as any)
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat] } as any)
    render(<AppSidebar />)
    const chatBtns = screen.getAllByTestId('sidebar-menu-button')
    fireEvent.click(chatBtns[0])
    expect(mockSetOpenMobile).toHaveBeenCalledWith(false)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/c/$chatId',
      params: { chatId: 'chat-1' },
    })
  })

  it('clicking the floating "Open sidebar" button calls setOpen(true)', () => {
    const mockSetOpen = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: false,
      isMobile: false,
      setOpen: mockSetOpen,
      setOpenMobile: vi.fn(),
    } as any)
    render(<AppSidebar />)
    fireEvent.click(screen.getByTitle('Open sidebar'))
    expect(mockSetOpen).toHaveBeenCalledWith(true)
  })

  it('clicking the floating "New Chat" button navigates to "/"', () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)
    fireEvent.click(screen.getByTitle('New Chat'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('clicking "Close sidebar" button calls setOpen(false) on desktop', () => {
    const mockSetOpen = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: true,
      isMobile: false,
      setOpen: mockSetOpen,
      setOpenMobile: vi.fn(),
    } as any)
    render(<AppSidebar />)
    fireEvent.click(screen.getByTitle('Close sidebar'))
    expect(mockSetOpen).toHaveBeenCalledWith(false)
  })

  it('clicking "Close sidebar" button calls setOpenMobile(false) on mobile', () => {
    const mockSetOpenMobile = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: true,
      isMobile: true,
      setOpen: vi.fn(),
      setOpenMobile: mockSetOpenMobile,
    } as any)
    render(<AppSidebar />)
    fireEvent.click(screen.getByTitle('Close sidebar'))
    expect(mockSetOpenMobile).toHaveBeenCalledWith(false)
  })

  it('clicking the brand name button in the sidebar navigates to "/"', () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)

    const brandBtn = screen.getByTitle('Go to chats')
    expect(brandBtn).toBeTruthy()
    fireEvent.click(brandBtn)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('clicking the sidebar mode toggle navigates to "/studio" from chat mode', () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)

    fireEvent.click(screen.getAllByTitle('Switch to Image Studio')[0])
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/studio' })
  })

  it('clicking the sidebar mode toggle navigates to "/" from studio mode', () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    const originalPath = window.location.pathname

    window.history.replaceState({}, '', '/studio')

    render(<AppSidebar />)

    fireEvent.click(screen.getAllByTitle('Switch to Chat')[0])
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })

    window.history.replaceState({}, '', originalPath)
  })

  it('handleNewChat on mobile calls setOpenMobile(false) before navigating', () => {
    const mockSetOpenMobile = vi.fn()
    const mockNavigate = vi.fn()
    vi.mocked(useSidebar).mockReturnValue({
      open: true,
      isMobile: true,
      setOpen: vi.fn(),
      setOpenMobile: mockSetOpenMobile,
    } as any)
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    render(<AppSidebar />)
    fireEvent.click(screen.getByText('New Chat'))
    expect(mockSetOpenMobile).toHaveBeenCalledWith(false)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('dismissing the delete chat dialog clears the delete state', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(useQuery)
      .mockReturnValueOnce(mockConvexUser as any)
      .mockReturnValueOnce({ chats: [todayChat] } as any)
    render(<AppSidebar />)

    const deleteBtn = screen.getAllByRole('button', { name: /delete chat/i })[0]
    fireEvent.click(deleteBtn)
    expect(screen.getByTestId('alert-dialog')).toBeTruthy()

    fireEvent.click(screen.getByTestId('dialog-dismiss'))
    expect(screen.queryByTestId('alert-dialog')).toBeNull()
  })

  it('dismissing the bulk delete dialog clears the bulk delete dialog state', () => {
    const selectedIds = new Set(['chat-1'])
    ;(vi.mocked(useBulkSelectionStore) as any).mockImplementation(
      (selector: (s: any) => any) =>
        selector({
          selectedChatIds: selectedIds,
          selectChat: vi.fn(),
          selectAll: vi.fn(),
          deselectAll: vi.fn(),
          getSelectedChatIds: vi.fn().mockReturnValue(['chat-1']),
        }),
    )
    render(<AppSidebar />)

    const deleteBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.trim() === 'Delete')
    expect(deleteBtn).toBeTruthy()
    fireEvent.click(deleteBtn!)
    expect(screen.getByTestId('alert-dialog')).toBeTruthy()

    fireEvent.click(screen.getByTestId('dialog-dismiss'))
    expect(screen.queryByTestId('alert-dialog')).toBeNull()
  })
})
