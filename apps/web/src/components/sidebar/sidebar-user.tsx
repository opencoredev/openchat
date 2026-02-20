import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "@/components/icons";

interface SidebarUserInfo {
	id: string;
	name?: string | null;
	email?: string | null;
	image?: string | null;
}

export interface SidebarUserProps {
	user: SidebarUserInfo | null | undefined;
	isMobile: boolean;
	setOpen: (open: boolean) => void;
}

export function SidebarUser({ user, isMobile, setOpen }: SidebarUserProps) {
	const navigate = useNavigate();

	if (!user) return null;

	return (
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
	);
}
