/**
 * Account Section — profile, authentication, delete account
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { DeleteAccountModal } from "@/components/delete-account-modal";

export function AccountSection({
	user,
	refetchSession,
}: { user: { id: string; name?: string | null; email?: string | null }; refetchSession: () => Promise<unknown> }) {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameValue, setNameValue] = useState(user.name || "");
	const [isSaving, setIsSaving] = useState(false);

	// Get Convex user ID from external ID (Better Auth ID)
	const convexUser = useQuery(api.users.getByExternalId, { externalId: user.id });
	const updateName = useMutation(api.users.updateName);

	const handleSaveName = async () => {
		if (!convexUser || !nameValue.trim()) return;
		setIsSaving(true);
		try {
			// Update name in Better Auth (primary auth source)
			await authClient.updateUser({ name: nameValue.trim() });
			// Also update in Convex for consistency
			await updateName({ userId: convexUser._id, name: nameValue.trim() });
			// Refresh the session to get the updated user data
			await refetchSession();
			setIsEditingName(false);
		} catch (error) {
			console.error("Failed to update name:", error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancelEdit = () => {
		setNameValue(convexUser?.name || user.name || "");
		setIsEditingName(false);
	};

	// Use Convex user name (real-time) if available, fall back to auth user name
	const displayName = convexUser?.name || user.name || "Not set";

	return (
		<div className="space-y-8">
			{/* Profile */}
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Profile
				</h2>
				<div className="rounded-xl border bg-card">
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
								<svg
									className="size-5 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</div>
							{isEditingName ? (
								<div className="flex items-center gap-2">
									<Input
										value={nameValue}
										onChange={(e) => setNameValue(e.target.value)}
										placeholder="Enter your name"
										className="h-8 w-48"
										autoFocus
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSaveName();
											if (e.key === "Escape") handleCancelEdit();
										}}
									/>
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={handleSaveName}
										disabled={isSaving || !nameValue.trim()}
									>
										{isSaving ? (
											<Loader2Icon className="size-4 animate-spin" />
										) : (
											<CheckIcon className="size-4 text-success" />
										)}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={handleCancelEdit}
										disabled={isSaving}
									>
										<XIcon className="size-4 text-muted-foreground" />
									</Button>
								</div>
							) : (
								<div>
									<p className="text-sm font-medium">Name</p>
									<p className="text-sm text-muted-foreground">{displayName}</p>
								</div>
							)}
						</div>
						{!isEditingName && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setNameValue(convexUser?.name || user.name || "");
									setIsEditingName(true);
								}}
								disabled={!convexUser}
							>
								<PencilIcon className="mr-1.5 size-3.5" />
								Edit
							</Button>
						)}
					</div>
					<Separator />
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
								<svg
									className="size-5 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
							</div>
							<div>
								<p className="text-sm font-medium">Email</p>
								<p className="text-sm text-muted-foreground">{user.email || "Not set"}</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Authentication */}
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
					Authentication
				</h2>
				<div className="rounded-xl border bg-card">
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
								<svg
									className="size-5 text-muted-foreground"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
								</svg>
							</div>
							<div>
								<p className="text-sm font-medium">GitHub</p>
								<p className="text-sm text-muted-foreground">Connected via OAuth</p>
							</div>
						</div>
						<span className="flex items-center gap-1.5 text-xs font-medium text-primary">
							<svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Connected
						</span>
					</div>
				</div>
			</section>

			{/* Danger Zone */}
			<section className="space-y-4">
				<h2 className="text-sm font-medium text-destructive uppercase tracking-wide">
					Danger Zone
				</h2>
				<div className="rounded-xl border border-destructive/20 bg-destructive/5">
					<div className="flex items-center justify-between p-4">
						<div>
							<p className="text-sm font-medium">Delete Account</p>
							<p className="text-sm text-muted-foreground">
								Permanently delete your account and all data
							</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => setDeleteModalOpen(true)}
							disabled={!convexUser}
						>
							Delete
						</Button>
					</div>
				</div>
			</section>

			{/* Delete Account Modal */}
			{convexUser && (
				<DeleteAccountModal
					userId={convexUser._id}
					externalId={user.id}
					open={deleteModalOpen}
					onOpenChange={setDeleteModalOpen}
				/>
			)}
		</div>
	);
}
