import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-client";
import {
	Sidebar,
	SidebarFooter,
	useSidebar,
} from "../ui/sidebar";
import { ChevronRightIcon } from "@/components/icons";
import { SidebarFloatingControls, SidebarHeaderContent } from "./sidebar-header";
import { ChatList } from "./chat-list";

export function AppSidebar({
	variant = "inset",
	collapsible = "offcanvas",
	...props
}: React.ComponentProps<typeof Sidebar>) {
	const { user } = useAuth();
	const { isMobile, setOpen, setOpenMobile } = useSidebar();
	const navigate = useNavigate();

	const handleNewChat = () => {
		if (isMobile) {
			setOpenMobile(false);
		}
		navigate({ to: "/" });
	};

	return (
		<>
			<SidebarFloatingControls onNewChat={handleNewChat} />

			<Sidebar variant={variant} collapsible={collapsible} {...props}>
				<SidebarHeaderContent onNewChat={handleNewChat} />
				<ChatList />

				{/* Footer with Profile Card - always visible, sticky at bottom */}
				<SidebarFooter className="shrink-0 p-3">
					{user && (
						<button
							onClick={() => {
								if (isMobile) setOpen(false);
								navigate({ to: "/settings" });
							}}
							className="group flex w-full items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-3 transition-all hover:bg-sidebar-accent/70 focus:outline-none"
						>
							{user.image ? (
								<img
									src={user.image}
									alt={user.name || "User"}
									className="size-10 shrink-0 rounded-full ring-2 ring-sidebar-primary/20"
								/>
							) : (
								<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-base font-semibold text-sidebar-primary-foreground ring-2 ring-sidebar-primary/20">
									{(user.name || user.email || "U")[0].toUpperCase()}
								</div>
							)}
							<div className="min-w-0 flex-1 text-left">
								<div className="truncate text-sm font-semibold text-sidebar-foreground">
									{user.name || "User"}
								</div>
								<div className="truncate text-xs text-sidebar-foreground/50">Settings</div>
							</div>
							<ChevronRightIcon />
						</button>
					)}
				</SidebarFooter>
			</Sidebar>
		</>
	);
}
