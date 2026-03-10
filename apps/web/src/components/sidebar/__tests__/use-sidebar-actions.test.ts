// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { useSidebarActions } from "../use-sidebar-actions";
import { convexClient as _convexClient } from "@/lib/convex";
import { toast } from "sonner";
import type { Id } from "@server/convex/_generated/dataModel";

const convexClient = _convexClient as NonNullable<typeof _convexClient>;

vi.mock("@tanstack/react-router", () => ({
	useNavigate: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/convex", () => ({
	convexClient: {
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue(null),
		action: vi.fn().mockResolvedValue(null),
	},
}));

vi.mock("@server/convex/_generated/api", () => ({
	api: {
		chatTitle: {
			setTitle: "chatTitle:setTitle",
			generateTitle: "chatTitle:generateTitle",
			setGeneratedTitle: "chatTitle:setGeneratedTitle",
		},
		messages: { getFirstUserMessage: "messages:getFirstUserMessage" },
		chats: { remove: "chats:remove", removeBulk: "chats:removeBulk" },
		chatShares: { createOrGet: "chatShares:createOrGet" },
		users: { hasOpenRouterKey: "users:hasOpenRouterKey" },
	},
}));

const mockSelectChat = vi.fn();
const mockSelectAll = vi.fn();
const mockDeselectAll = vi.fn();
const mockGetSelectedChatIds = vi.fn(() => [] as string[]);
const mockSelectedChatIds = new Set<string>();

vi.mock("@/stores/bulk-selection", () => ({
	useBulkSelectionStore: vi.fn((selector: (s: any) => any) =>
		selector({
			selectedChatIds: mockSelectedChatIds,
			selectChat: mockSelectChat,
			selectAll: mockSelectAll,
			deselectAll: mockDeselectAll,
			getSelectedChatIds: mockGetSelectedChatIds,
		}),
	),
}));

const mockNavigate = vi.fn();

const defaultParams = {
	convexUser: { _id: "user-1" as any },
	currentChatId: "chat-1",
	navigate: mockNavigate,
	chats: [
		{ _id: "chat-1", title: "Chat One" },
		{ _id: "chat-2", title: "Chat Two" },
	] as any[],
	confirmDelete: false,
	chatTitleLength: "standard",
	activeProvider: "openrouter",
	flatChatIds: ["chat-1", "chat-2"] as any[],
	setTitleGenerating: vi.fn(),
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mockSelectedChatIds.clear();
});

describe("useSidebarActions - initial state", () => {
	it("initializes contextMenu as null", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.contextMenu).toBeNull();
	});

	it("initializes deleteChatId as null", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.deleteChatId).toBeNull();
	});

	it("initializes editingChatId as null", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.editingChatId).toBeNull();
	});

	it("initializes editValue as empty string", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.editValue).toBe("");
	});

	it("initializes showBulkDeleteDialog as false", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.showBulkDeleteDialog).toBe(false);
	});

	it("initializes isBulkDeleting as false", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		expect(result.current.isBulkDeleting).toBe(false);
	});
});

describe("handleSelectClick", () => {
	it("calls selectChat on normal click", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		act(() => {
			result.current.handleSelectClick("chat-2" as Id<"chats">, false);
		});
		expect(mockSelectChat).toHaveBeenCalledWith("chat-2");
	});

	it("calls selectAll with range on shift+click with anchor", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		act(() => {
			result.current.handleSelectClick("chat-1" as Id<"chats">, false);
		});
		act(() => {
			result.current.handleSelectClick("chat-2" as Id<"chats">, true);
		});
		expect(mockSelectAll).toHaveBeenCalledWith(["chat-1", "chat-2"]);
	});

	it("calls selectChat on shift+click when no anchor and no currentChatId", () => {
		const params = { ...defaultParams, currentChatId: undefined, flatChatIds: ["chat-1", "chat-2"] as any[] };
		const { result } = renderHook(() => useSidebarActions(params));
		act(() => {
			result.current.handleSelectClick("chat-2" as Id<"chats">, true);
		});
		expect(mockSelectChat).toHaveBeenCalledWith("chat-2");
	});
});

describe("handleChatContextMenu", () => {
	it("sets contextMenu state with chatId and coordinates", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 100,
			clientY: 200,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		expect(result.current.contextMenu).toEqual({ chatId: "chat-1", x: 100, y: 200 });
	});

	it("calls preventDefault and stopPropagation", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 50,
			clientY: 50,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		expect(mockEvent.preventDefault).toHaveBeenCalled();
		expect(mockEvent.stopPropagation).toHaveBeenCalled();
	});
});

describe("handleQuickDelete", () => {
	it("sets deleteChatId when confirmDelete=true", () => {
		const params = { ...defaultParams, confirmDelete: true };
		const { result } = renderHook(() => useSidebarActions(params));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleQuickDelete("chat-1", mockEvent);
		});
		expect(result.current.deleteChatId).toBe("chat-1");
	});

	it("calls handleDeleteChat when confirmDelete=false", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		await act(async () => {
			result.current.handleQuickDelete("chat-1", mockEvent);
		});
		expect(vi.mocked(convexClient.mutation)).toHaveBeenCalled();
	});
});

describe("handleRenameFromMenu", () => {
	it("sets editingChatId and editValue from contextMenu", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 10,
			clientY: 10,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		act(() => {
			result.current.handleRenameFromMenu();
		});
		expect(result.current.editingChatId).toBe("chat-1");
		expect(result.current.editValue).toBe("Chat One");
		expect(result.current.contextMenu).toBeNull();
	});

	it("does nothing when contextMenu is null", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		act(() => {
			result.current.handleRenameFromMenu();
		});
		expect(result.current.editingChatId).toBeNull();
	});
});

describe("handleStartEdit", () => {
	it("sets editingChatId, editValue, and editOriginal", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleStartEdit("chat-1", "Chat One", mockEvent);
		});
		expect(result.current.editingChatId).toBe("chat-1");
		expect(result.current.editValue).toBe("Chat One");
	});
});

describe("handleCancelEdit", () => {
	it("clears editing state", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleStartEdit("chat-1", "Chat One", mockEvent);
		});
		act(() => {
			result.current.handleCancelEdit();
		});
		expect(result.current.editingChatId).toBeNull();
		expect(result.current.editValue).toBe("");
	});
});

describe("handleSubmitEdit", () => {
	it("cancels when no editingChatId", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleSubmitEdit();
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("cancels when editValue is empty", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleStartEdit("chat-1", "Chat One", mockEvent);
		});
		act(() => {
			result.current.setEditValue("");
		});
		await act(async () => {
			await result.current.handleSubmitEdit();
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("cancels when title is same as original", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleStartEdit("chat-1", "Chat One", mockEvent);
		});
		await act(async () => {
			await result.current.handleSubmitEdit();
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("calls convexClient.mutation with new title", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
		act(() => {
			result.current.handleStartEdit("chat-1", "Chat One", mockEvent);
		});
		act(() => {
			result.current.setEditValue("New Title");
		});
		await act(async () => {
			await result.current.handleSubmitEdit();
		});
		expect(vi.mocked(convexClient.mutation)).toHaveBeenCalledWith(
			"chatTitle:setTitle",
			expect.objectContaining({ title: "New Title" }),
		);
	});
});

describe("handleRegenerateTitle", () => {
	it("returns early when no convexUser", async () => {
		const params = { ...defaultParams, convexUser: null };
		const { result } = renderHook(() => useSidebarActions(params));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(convexClient.query)).not.toHaveBeenCalled();
	});

	it("shows error when no seedText", async () => {
		vi.mocked(convexClient.query).mockResolvedValueOnce(null);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("No message available to generate a name.");
	});

	it("calls setTitleGenerating on success path", async () => {
		vi.mocked(convexClient.query).mockResolvedValueOnce("some seed text");
		vi.mocked(convexClient.action).mockResolvedValueOnce("Generated Title");
		vi.mocked(convexClient.mutation).mockResolvedValueOnce(undefined);
		const setTitleGenerating = vi.fn();
		const params = { ...defaultParams, setTitleGenerating };
		const { result } = renderHook(() => useSidebarActions(params));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(setTitleGenerating).toHaveBeenCalledWith("chat-1", true, "manual");
		expect(setTitleGenerating).toHaveBeenCalledWith("chat-1", false);
	});

	it("shows error when no generatedTitle and openrouter with no key", async () => {
		vi.mocked(convexClient.query)
			.mockResolvedValueOnce("some seed text")
			.mockResolvedValueOnce(false);
		vi.mocked(convexClient.action).mockResolvedValueOnce(null);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
			"Connect your OpenRouter API key to generate titles with this provider.",
		);
	});

	it("shows generic error when no generatedTitle and openrouter with key", async () => {
		vi.mocked(convexClient.query)
			.mockResolvedValueOnce("some seed text")
			.mockResolvedValueOnce(true);
		vi.mocked(convexClient.action).mockResolvedValueOnce(null);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
			"Could not generate a chat title right now. Try again.",
		);
	});

	it("shows rate limit error on catch", async () => {
		vi.mocked(convexClient.query).mockResolvedValueOnce("some seed text");
		vi.mocked(convexClient.action).mockRejectedValueOnce(
			new Error("too many title generations"),
		);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
			"Too many title generations. Please try again later.",
		);
	});

	it("shows generic error on catch", async () => {
		vi.mocked(convexClient.query).mockResolvedValueOnce("some seed text");
		vi.mocked(convexClient.action).mockRejectedValueOnce(new Error("network error"));
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleRegenerateTitle("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to regenerate chat name");
	});
});

describe("handleDeleteChat", () => {
	it("returns early when no convexUser", async () => {
		const params = { ...defaultParams, convexUser: null };
		const { result } = renderHook(() => useSidebarActions(params));
		await act(async () => {
			await result.current.handleDeleteChat("chat-1");
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("calls mutation and navigates when deleting current chat", async () => {
		vi.mocked(convexClient.mutation).mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleDeleteChat("chat-1");
		});
		expect(vi.mocked(convexClient.mutation)).toHaveBeenCalledWith(
			"chats:remove",
			expect.objectContaining({ chatId: "chat-1" }),
		);
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
	});

	it("does not navigate when deleting non-current chat", async () => {
		vi.mocked(convexClient.mutation).mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleDeleteChat("chat-2");
		});
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("shows error toast on failure", async () => {
		vi.mocked(convexClient.mutation).mockRejectedValueOnce(new Error("server error"));
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleDeleteChat("chat-1");
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete chat");
	});
});

describe("handleBulkDelete", () => {
	it("returns early when no convexUser", async () => {
		const params = { ...defaultParams, convexUser: null };
		const { result } = renderHook(() => useSidebarActions(params));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("returns early when no selected chats", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce([]);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(convexClient.mutation)).not.toHaveBeenCalled();
	});

	it("shows success toast with deleted count", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-2"]);
		vi.mocked(convexClient.mutation).mockResolvedValueOnce({ deleted: 1, failed: 0 });
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Deleted 1 chat");
	});

	it("shows error toast with failed count", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-2"]);
		vi.mocked(convexClient.mutation).mockResolvedValueOnce({ deleted: 0, failed: 1 });
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete 1 chat");
	});

	it("navigates when current chat is deleted", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-1"]);
		vi.mocked(convexClient.mutation).mockResolvedValueOnce({ deleted: 1, failed: 0 });
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
	});

	it("does not navigate when current chat is not deleted", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-2"]);
		vi.mocked(convexClient.mutation).mockResolvedValueOnce({ deleted: 1, failed: 0 });
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("shows generic error toast on failure", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-1"]);
		vi.mocked(convexClient.mutation).mockRejectedValueOnce(new Error("server error"));
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete chats");
	});

	it("shows rate limit error message on RateLimitError", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-1"]);
		const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
			name: "RateLimitError",
		});
		vi.mocked(convexClient.mutation).mockRejectedValueOnce(rateLimitError);
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Rate limit exceeded");
	});

	it("calls deselectAll after successful bulk delete", async () => {
		mockGetSelectedChatIds.mockReturnValueOnce(["chat-2"]);
		vi.mocked(convexClient.mutation).mockResolvedValueOnce({ deleted: 1, failed: 0 });
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			await result.current.handleBulkDelete();
		});
		expect(mockDeselectAll).toHaveBeenCalled();
	});
});

describe("handleDeleteFromMenu", () => {
	it("sets deleteChatId when confirmDelete=true", () => {
		const params = { ...defaultParams, confirmDelete: true };
		const { result } = renderHook(() => useSidebarActions(params));
		act(() => {
			result.current.handleDeleteFromMenu("chat-1");
		});
		expect(result.current.deleteChatId).toBe("chat-1");
	});

	it("calls handleDeleteChat when confirmDelete=false", async () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		await act(async () => {
			result.current.handleDeleteFromMenu("chat-1");
		});
		expect(vi.mocked(convexClient.mutation)).toHaveBeenCalled();
	});

	it("clears contextMenu when called", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 10,
			clientY: 10,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		act(() => {
			result.current.handleDeleteFromMenu("chat-1");
		});
		expect(result.current.contextMenu).toBeNull();
	});
});

describe("useEffect - window event listeners", () => {
	it("dismisses contextMenu on window click", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 10,
			clientY: 10,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		expect(result.current.contextMenu).not.toBeNull();
		act(() => {
			window.dispatchEvent(new MouseEvent("click"));
		});
		expect(result.current.contextMenu).toBeNull();
	});

	it("dismisses contextMenu on window contextmenu", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 10,
			clientY: 10,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		act(() => {
			window.dispatchEvent(new MouseEvent("contextmenu"));
		});
		expect(result.current.contextMenu).toBeNull();
	});

	it("clears contextMenu on Escape key", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 10,
			clientY: 10,
		} as any;
		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		});
		expect(result.current.contextMenu).toBeNull();
	});

	it("calls deselectAll on Escape when selections exist", () => {
		mockSelectedChatIds.add("chat-1");
		const { result } = renderHook(() => useSidebarActions(defaultParams));
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		});
		expect(mockDeselectAll).toHaveBeenCalled();
		mockSelectedChatIds.clear();
	});
});

describe("useEffect - context menu position clamping", () => {
	it("clamps context menu position when menu element has getBoundingClientRect", () => {
		const { result } = renderHook(() => useSidebarActions(defaultParams));

		const fakeElement = {
			getBoundingClientRect: () => ({ width: 200, height: 300 }),
		} as unknown as HTMLDivElement;

		act(() => {
			(result.current.contextMenuElementRef as any).current = fakeElement;
		});

		const mockEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 5000,
			clientY: 5000,
		} as any;

		act(() => {
			result.current.handleChatContextMenu("chat-1", mockEvent);
		});

		expect(result.current.contextMenu).not.toBeNull();
		if (result.current.contextMenu) {
			expect(result.current.contextMenu.x).toBeLessThanOrEqual(
				window.innerWidth - 200 - 12,
			);
			expect(result.current.contextMenu.y).toBeLessThanOrEqual(
				window.innerHeight - 300 - 12,
			);
		}
	});
});
