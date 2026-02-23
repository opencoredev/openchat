// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@base-ui/react/avatar", () => ({
	Avatar: {
		Root: ({
			children,
			...props
		}: {
			children?: unknown;
			[key: string]: unknown;
		}) => (
			<div data-testid="avatar-root" {...(props as Record<string, unknown>)}>
				{children as React.ReactNode}
			</div>
		),
		Image: (props: { [key: string]: unknown }) => (
			<img
				data-testid="avatar-image"
				alt=""
				{...(props as Record<string, unknown>)}
			/>
		),
		Fallback: ({
			children,
			...props
		}: {
			children?: unknown;
			[key: string]: unknown;
		}) => (
			<span
				data-testid="avatar-fallback"
				{...(props as Record<string, unknown>)}
			>
				{children as React.ReactNode}
			</span>
		),
	},
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import {
	Avatar,
	AvatarImage,
	AvatarFallback,
	AvatarBadge,
	AvatarGroup,
	AvatarGroupCount,
} from "../avatar";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Avatar", () => {
	it("renders without crashing", () => {
		render(<Avatar />);
		expect(document.body).toBeTruthy();
	});

	it("has data-slot='avatar'", () => {
		render(<Avatar />);
		const el = screen.getByTestId("avatar-root");
		expect(el.getAttribute("data-slot")).toBe("avatar");
	});

	it("has default size='default'", () => {
		render(<Avatar />);
		const el = screen.getByTestId("avatar-root");
		expect(el.getAttribute("data-size")).toBe("default");
	});

	it("applies size='sm'", () => {
		render(<Avatar size="sm" />);
		const el = screen.getByTestId("avatar-root");
		expect(el.getAttribute("data-size")).toBe("sm");
	});

	it("applies size='lg'", () => {
		render(<Avatar size="lg" />);
		const el = screen.getByTestId("avatar-root");
		expect(el.getAttribute("data-size")).toBe("lg");
	});

	it("applies custom className", () => {
		render(<Avatar className="custom-avatar" />);
		const el = screen.getByTestId("avatar-root");
		expect(el.className).toContain("custom-avatar");
	});

	it("renders children", () => {
		render(<Avatar><span>child</span></Avatar>);
		expect(screen.getByText("child")).toBeTruthy();
	});
});

describe("AvatarImage", () => {
	it("renders an image element", () => {
		render(<AvatarImage />);
		expect(screen.getByTestId("avatar-image")).toBeTruthy();
	});

	it("has data-slot='avatar-image'", () => {
		render(<AvatarImage />);
		const el = screen.getByTestId("avatar-image");
		expect(el.getAttribute("data-slot")).toBe("avatar-image");
	});

	it("forwards src prop", () => {
		render(<AvatarImage src="https://example.com/avatar.png" />);
		const el = screen.getByTestId("avatar-image");
		expect(el.getAttribute("src")).toBe("https://example.com/avatar.png");
	});

	it("applies custom className", () => {
		render(<AvatarImage className="img-cls" />);
		const el = screen.getByTestId("avatar-image");
		expect(el.className).toContain("img-cls");
	});

	it("includes base class in className", () => {
		render(<AvatarImage />);
		const el = screen.getByTestId("avatar-image");
		expect(el.className).toContain("rounded-full");
	});
});

describe("AvatarFallback", () => {
	it("renders fallback text", () => {
		render(<AvatarFallback>AB</AvatarFallback>);
		expect(screen.getByText("AB")).toBeTruthy();
	});

	it("has data-slot='avatar-fallback'", () => {
		render(<AvatarFallback>FB</AvatarFallback>);
		const el = screen.getByTestId("avatar-fallback");
		expect(el.getAttribute("data-slot")).toBe("avatar-fallback");
	});

	it("applies custom className", () => {
		render(<AvatarFallback className="fb-cls">X</AvatarFallback>);
		const el = screen.getByTestId("avatar-fallback");
		expect(el.className).toContain("fb-cls");
	});

	it("includes base class in className", () => {
		render(<AvatarFallback>Y</AvatarFallback>);
		const el = screen.getByTestId("avatar-fallback");
		expect(el.className).toContain("bg-muted");
	});
});

describe("AvatarBadge", () => {
	it("renders without crashing", () => {
		render(<AvatarBadge data-testid="badge" />);
		expect(screen.getByTestId("badge")).toBeTruthy();
	});

	it("has data-slot='avatar-badge'", () => {
		render(<AvatarBadge data-testid="badge" />);
		const el = screen.getByTestId("badge");
		expect(el.getAttribute("data-slot")).toBe("avatar-badge");
	});

	it("renders as a span element", () => {
		render(<AvatarBadge data-testid="badge" />);
		const el = screen.getByTestId("badge");
		expect(el.tagName.toLowerCase()).toBe("span");
	});

	it("applies custom className", () => {
		render(<AvatarBadge className="badge-cls" data-testid="badge" />);
		const el = screen.getByTestId("badge");
		expect(el.className).toContain("badge-cls");
	});

	it("includes base class in className", () => {
		render(<AvatarBadge data-testid="badge" />);
		const el = screen.getByTestId("badge");
		expect(el.className).toContain("bg-primary");
	});

	it("renders children", () => {
		render(<AvatarBadge><svg data-testid="badge-icon" /></AvatarBadge>);
		expect(screen.getByTestId("badge-icon")).toBeTruthy();
	});
});

describe("AvatarGroup", () => {
	it("renders without crashing", () => {
		render(<AvatarGroup data-testid="group" />);
		expect(screen.getByTestId("group")).toBeTruthy();
	});

	it("has data-slot='avatar-group'", () => {
		render(<AvatarGroup data-testid="group" />);
		const el = screen.getByTestId("group");
		expect(el.getAttribute("data-slot")).toBe("avatar-group");
	});

	it("renders as a div element", () => {
		render(<AvatarGroup data-testid="group" />);
		const el = screen.getByTestId("group");
		expect(el.tagName.toLowerCase()).toBe("div");
	});

	it("renders children", () => {
		render(<AvatarGroup><span>child avatar</span></AvatarGroup>);
		expect(screen.getByText("child avatar")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<AvatarGroup className="grp-cls" data-testid="group" />);
		const el = screen.getByTestId("group");
		expect(el.className).toContain("grp-cls");
	});

	it("includes base class in className", () => {
		render(<AvatarGroup data-testid="group" />);
		const el = screen.getByTestId("group");
		expect(el.className).toContain("flex");
	});
});

describe("AvatarGroupCount", () => {
	it("renders without crashing", () => {
		render(<AvatarGroupCount data-testid="count" />);
		expect(screen.getByTestId("count")).toBeTruthy();
	});

	it("has data-slot='avatar-group-count'", () => {
		render(<AvatarGroupCount data-testid="count" />);
		const el = screen.getByTestId("count");
		expect(el.getAttribute("data-slot")).toBe("avatar-group-count");
	});

	it("renders as a div element", () => {
		render(<AvatarGroupCount data-testid="count" />);
		const el = screen.getByTestId("count");
		expect(el.tagName.toLowerCase()).toBe("div");
	});

	it("renders children", () => {
		render(<AvatarGroupCount>+3</AvatarGroupCount>);
		expect(screen.getByText("+3")).toBeTruthy();
	});

	it("applies custom className", () => {
		render(<AvatarGroupCount className="count-cls" data-testid="count" />);
		const el = screen.getByTestId("count");
		expect(el.className).toContain("count-cls");
	});

	it("includes base class in className", () => {
		render(<AvatarGroupCount data-testid="count" />);
		const el = screen.getByTestId("count");
		expect(el.className).toContain("rounded-full");
	});
});
