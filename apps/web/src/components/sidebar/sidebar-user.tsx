import { useNavigate } from "@tanstack/react-router";

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
			className="group flex size-11 items-center justify-center rounded-full bg-sidebar-accent/40 transition-all hover:bg-sidebar-accent/70 focus:outline-none"
			title="Open settings"
			aria-label="Open settings"
		>
			{user.image ? (
				<img
					src={user.image}
					alt={user.name || "User"}
					className="size-9 shrink-0 rounded-full ring-2 ring-sidebar-primary/20"
				/>
			) : (
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground ring-2 ring-sidebar-primary/20">
					{(user.name || user.email || "U")[0].toUpperCase()}
				</div>
			)}
		</button>
	);
}
