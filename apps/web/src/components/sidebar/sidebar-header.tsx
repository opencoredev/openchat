import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { cn } from "@/lib/utils";
import { MenuIcon, PlusIcon, SidebarIcon } from "@/components/icons";

interface SidebarHeaderProps {
	onNewChat: () => void;
}

/** Mobile hamburger menu + collapsed floating bar (rendered outside <Sidebar>) */
export function SidebarFloatingControls({ onNewChat }: SidebarHeaderProps) {
	const { open, isMobile, setOpen, setOpenMobile } = useSidebar();

	return (
		<>
			{/* Mobile hamburger menu - CSS-based visibility (md:hidden), no JS required */}
			<button
				onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
				className="fixed left-3 top-3 z-50 flex size-11 items-center justify-center rounded-xl bg-sidebar/95 shadow-lg ring-1 ring-sidebar-border/50 backdrop-blur-sm text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar hover:text-sidebar-foreground active:scale-95 md:hidden"
				aria-label="Open menu"
			>
				<MenuIcon />
			</button>

			{/* Collapsed floating bar - desktop only, shows when sidebar is closed */}
			<div
				className={cn(
					"fixed left-3 top-3 z-50 flex items-center gap-1 rounded-xl bg-sidebar/95 p-1 shadow-lg ring-1 ring-sidebar-border/50 backdrop-blur-sm",
					"transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
					"hidden md:flex",
					open ? "pointer-events-none opacity-0 scale-95" : "opacity-100 scale-100",
				)}
			>
				<button
					onClick={() => setOpen(true)}
					className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					title="Open sidebar"
				>
					<SidebarIcon />
				</button>
				<button
					onClick={onNewChat}
					className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					title="New Chat"
				>
					<PlusIcon />
				</button>
			</div>
		</>
	);
}

/** Header toggle + logo + new chat button (rendered inside <Sidebar>) */
export function SidebarHeaderContent({ onNewChat }: SidebarHeaderProps) {
	const { isMobile, setOpen, setOpenMobile } = useSidebar();

	return (
		<>
			{/* Header: Toggle button left, Logo centered */}
			<div className="relative flex h-14 shrink-0 items-center justify-center px-3">
				{/* Toggle button - absolute positioned left */}
				<button
					onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
					className="absolute left-3 flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					title="Close sidebar"
				>
					<SidebarIcon />
				</button>

				{/* Logo - centered */}
				<button
					onClick={onNewChat}
					className="flex items-center transition-opacity hover:opacity-80"
				>
					<span className="text-xl font-bold tracking-tight text-sidebar-foreground">
						oss<span className="text-sidebar-primary">chat</span>
					</span>
				</button>
			</div>

			{/* New Chat Button */}
			<div className="shrink-0 px-3 pb-3">
				<Button onClick={onNewChat} className="w-full justify-center gap-2" variant="default">
					New Chat
				</Button>
			</div>
		</>
	);
}
