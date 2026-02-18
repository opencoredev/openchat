/**
 * Shortcuts Section — keyboard bindings
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useShortcutsStore } from "@/stores/shortcuts";
import {
	SHORTCUT_CATEGORIES,
	SHORTCUT_DEFINITIONS,
	bindingHasModifier,
	bindingToTokens,
	eventToBinding,
	getConflictingShortcutIds,
	getEffectiveBinding,
	getShortcutById,
	isMacPlatform,
	isReservedShortcutBinding,
	normalizeBinding,
	type ShortcutActionId,
} from "@/lib/shortcuts";

const MODIFIER_TOKENS = new Set(["meta", "ctrl", "alt", "shift"]);

export function ShortcutsSection() {
	const bindings = useShortcutsStore((state) => state.bindings);
	const setBinding = useShortcutsStore((state) => state.setBinding);
	const resetBinding = useShortcutsStore((state) => state.resetBinding);
	const resetAllBindings = useShortcutsStore((state) => state.resetAllBindings);

	const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);
	const [captureError, setCaptureError] = useState<string | null>(null);

	const isMac = useMemo(() => isMacPlatform(), []);

	const groupedShortcuts = useMemo(() => {
		return SHORTCUT_CATEGORIES.map(({ id, label }) => ({
			category: id,
			label,
			items: SHORTCUT_DEFINITIONS.filter((shortcut) => shortcut.category === id),
		}));
	}, []);

	useEffect(() => {
		if (!recordingId) return;

		const onKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				setRecordingId(null);
				setCaptureError(null);
				return;
			}

			const pressed = eventToBinding(event);
			const normalized = normalizeBinding(pressed);
			if (!normalized) return;

			const hasPrimaryKey = normalized
				.split("+")
				.some((token) => token && !MODIFIER_TOKENS.has(token));

			if (!hasPrimaryKey) {
				setCaptureError("Press a full shortcut, not only modifier keys.");
				return;
			}

			if (!bindingHasModifier(normalized) && normalized !== "escape") {
				setCaptureError("Shortcuts need at least one modifier key (Ctrl/Cmd, Alt, Shift).");
				return;
			}

			if (isReservedShortcutBinding(normalized)) {
				setCaptureError("That shortcut is reserved by the browser. Pick another one.");
				return;
			}

			const conflicts = getConflictingShortcutIds(recordingId, normalized, bindings, isMac);
			if (conflicts.length > 0) {
				const conflictLabel = getShortcutById(conflicts[0])?.label ?? "another shortcut";
				setCaptureError(`Already used by "${conflictLabel}".`);
				return;
			}

			setBinding(recordingId, normalized);
			setCaptureError(null);
			setRecordingId(null);
		};

		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [bindings, isMac, recordingId, setBinding]);

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
						Keyboard Shortcuts
					</h2>
					<Button variant="outline" size="sm" onClick={resetAllBindings}>
						Reset all
					</Button>
				</div>

				<div className="rounded-xl border bg-card p-4 space-y-3">
					<p className="text-sm text-muted-foreground">
						Click any shortcut to remap it. Press Escape to cancel recording.
					</p>
					{captureError && <p className="text-sm text-destructive">{captureError}</p>}
				</div>

				{groupedShortcuts.map((group) => (
					<div key={group.category} className="space-y-2">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{group.label}
						</h3>
						<div className="rounded-xl border bg-card divide-y divide-border">
							{group.items.map((shortcut) => {
								const effectiveBinding = getEffectiveBinding(shortcut, bindings, isMac);
								const tokens = bindingToTokens(effectiveBinding, isMac);
								const isRecording = recordingId === shortcut.id;
								const hasOverride = Boolean(bindings[shortcut.id]);

								return (
									<div key={shortcut.id} className="flex items-center justify-between gap-3 px-4 py-3">
										<div className="min-w-0">
											<p className="text-sm font-medium">{shortcut.label}</p>
											<p className="text-xs text-muted-foreground">{shortcut.description}</p>
										</div>

										<div className="flex items-center gap-2 shrink-0">
											<Button
												variant={isRecording ? "default" : "outline"}
												size="sm"
												onClick={() => {
													setCaptureError(null);
													setRecordingId(isRecording ? null : shortcut.id);
												}}
											>
												{isRecording ? "Press keys..." : "Change"}
											</Button>

											<div className="flex items-center gap-1 min-w-[140px] justify-end">
												{tokens.length > 0 ? (
													tokens.map((token, index) => (
														<kbd
															key={`${shortcut.id}-${token}-${index}`}
															className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-caption font-medium text-muted-foreground"
														>
															{token}
														</kbd>
													))
												) : (
													<span className="text-xs text-muted-foreground">Not set</span>
												)}
											</div>

											<Button
												variant="ghost"
												size="sm"
												disabled={!hasOverride}
												onClick={() => {
													if (isRecording) {
														setRecordingId(null);
														setCaptureError(null);
													}
													resetBinding(shortcut.id);
												}}
											>
												Reset
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				))}
			</section>
		</div>
	);
}
