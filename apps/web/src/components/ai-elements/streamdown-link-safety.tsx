"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown";
import { Checkbox } from "@/components/ui/checkbox";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LINK_SAFETY_DISABLED_KEY = "openchat-link-safety-disabled";

function isLinkSafetyDisabled(): boolean {
	try {
		return localStorage.getItem(LINK_SAFETY_DISABLED_KEY) === "true";
	} catch {
		return false;
	}
}

function LinkSafetyModal({ url, isOpen, onClose, onConfirm }: LinkSafetyModalProps) {
	const [dontShowAgain, setDontShowAgain] = useState(false);

	let displayHost: string;
	try {
		const parsed = new URL(url);
		displayHost = parsed.hostname;
	} catch {
		displayHost = url;
	}

	const handleContinue = () => {
		if (dontShowAgain) {
			try {
				localStorage.setItem(LINK_SAFETY_DISABLED_KEY, "true");
			} catch {
				/* ignore */
			}
		}
		onConfirm();
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<TriangleAlertIcon className="size-5 text-warning" />
						Open External Link
					</AlertDialogTitle>
					<AlertDialogDescription>
						We cannot guarantee the safety of external links, be cautious and keep your personal information safe.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<p className="text-sm font-medium text-foreground">
						Continue to: <span className="text-primary">{displayHost}</span>
					</p>
					<label className="flex items-start gap-2.5 cursor-pointer">
						<Checkbox
							checked={dontShowAgain}
							onCheckedChange={(checked) => setDontShowAgain(checked === true)}
							className="mt-0.5"
						/>
						<div className="space-y-1">
							<span className="text-sm font-medium text-foreground">Don't show this warning again.</span>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Note: We cannot guarantee the safety of external links, use this option at your own risk. You can turn this warning back on in your customization settings if you change your mind.
							</p>
						</div>
					</label>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-primary text-primary-foreground hover:bg-primary/90"
						onClick={handleContinue}
					>
						Continue
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function useLinkSafetyConfig(): LinkSafetyConfig {
	return useMemo(
		() => ({
			enabled: true,
			onLinkCheck: () => isLinkSafetyDisabled(),
			renderModal: (props: LinkSafetyModalProps) => <LinkSafetyModal {...props} />,
		}),
		[],
	);
}
