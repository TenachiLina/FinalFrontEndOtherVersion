import { afterEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { act, render, screen, userEvent, within } from "@/test/render";
import Alert from "./alert/Alert";
import Avatar from "./avatar/Avatar";
import Badge from "./badge/Badge";
import Button from "./button/Button";
import { Dropdown } from "./dropdown/Dropdown";
import { DropdownItem } from "./dropdown/DropdownItem";
import FeedbackHost from "./feedback/FeedbackHost";
import LoadError from "./feedback/LoadError";
import ResponsiveImage from "./images/ResponsiveImage";
import TwoColumnImageGrid from "./images/TwoColumnImageGrid";
import ThreeColumnImageGrid from "./images/ThreeColumnImageGrid";
import { Modal } from "./modal";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "./table";
import YouTubeEmbed from "./video/YouTubeEmbed";
import VideosExample from "./video/VideosExample";
import { answerConfirm, confirmDialog, dismissToast, getConfirm, getToasts, toast } from "@/lib/notify";
import { setLang } from "@/lib/i18n";

describe("Alert", () => {
  it.each([
    ["success", "border-success-500"],
    ["error", "border-error-500"],
    ["warning", "border-warning-500"],
    ["info", "border-blue-light-500"],
  ] as const)("shows a %s alert with its title and message", (variant, border) => {
    const { container } = render(<Alert variant={variant} title="Saved" message="All good" />);
    expect(screen.getByRole("heading", { name: "Saved" })).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(border);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("has no link unless asked for one", () => {
    render(<Alert variant="info" title="T" message="M" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the link with its default text and address", () => {
    render(<Alert variant="info" title="T" message="M" showLink />);
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "#");
  });

  it("shows a custom link", () => {
    render(<Alert variant="info" title="T" message="M" showLink linkHref="/help" linkText="Read the guide" />);
    expect(screen.getByRole("link", { name: "Read the guide" })).toHaveAttribute("href", "/help");
  });
});

describe("Avatar", () => {
  it("shows the image with a default description and no status dot", () => {
    const { container } = render(<Avatar src="/me.jpg" />);
    expect(screen.getByRole("img", { name: "User Avatar" })).toHaveAttribute("src", "/me.jpg");
    expect(container.firstElementChild).toHaveClass("h-10");
    expect(container.querySelector("span")).toBeNull();
  });

  it.each([
    ["online", "bg-success-500"],
    ["offline", "bg-error-400"],
    ["busy", "bg-warning-500"],
  ] as const)("shows a coloured dot when %s", (status, colour) => {
    const { container } = render(<Avatar src="/me.jpg" alt="Sara" size="xxlarge" status={status} />);
    expect(screen.getByRole("img", { name: "Sara" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("h-16");
    const dot = container.querySelector("span");
    expect(dot).toHaveClass(colour);
    expect(dot).toHaveClass("h-4");
  });
});

describe("Badge", () => {
  it("defaults to a light, medium, primary badge", () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText("New");
    expect(badge).toHaveClass("text-sm", "bg-brand-50", "text-brand-500");
  });

  it("uses the solid colours and small size", () => {
    render(
      <Badge variant="solid" color="error" size="sm">
        Late
      </Badge>
    );
    expect(screen.getByText("Late")).toHaveClass("text-theme-xs", "bg-error-500", "text-white");
  });

  it("puts icons before and after the text", () => {
    render(
      <Badge startIcon={<i data-testid="start" />} endIcon={<i data-testid="end" />}>
        Text
      </Badge>
    );
    const badge = screen.getByText("Text");
    expect(within(badge).getByTestId("start").parentElement).toHaveClass("me-1");
    expect(within(badge).getByTestId("end").parentElement).toHaveClass("ms-1");
  });
});

describe("Button", () => {
  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("can't be clicked when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("cursor-not-allowed", "opacity-50");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies size, variant, extra classes and icons", () => {
    render(
      <Button size="sm" variant="outline" className="w-full" startIcon={<i data-testid="s" />} endIcon={<i data-testid="e" />}>
        Go
      </Button>
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass("px-4", "bg-white", "w-full");
    expect(button).not.toHaveClass("cursor-not-allowed");
    expect(within(button).getByTestId("s")).toBeInTheDocument();
    expect(within(button).getByTestId("e")).toBeInTheDocument();
  });
});

describe("Dropdown", () => {
  function Harness({ onClose = () => {} }: { onClose?: () => void }) {
    return (
      <div>
        <button className="dropdown-toggle">Toggle</button>
        <button>Elsewhere</button>
        <Dropdown isOpen onClose={onClose} className="w-40">
          <button>Inside</button>
        </Dropdown>
      </div>
    );
  }

  it("renders nothing when closed", () => {
    render(
      <Dropdown isOpen={false} onClose={() => {}}>
        <span>Item</span>
      </Dropdown>
    );
    expect(screen.queryByText("Item")).not.toBeInTheDocument();
  });

  it("shows its content with the extra classes when open", () => {
    render(<Harness />);
    expect(screen.getByText("Inside").parentElement).toHaveClass("w-40");
  });

  it("closes on a click outside", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText("Elsewhere"));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open on a click inside or on its toggle button", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText("Inside"));
    await userEvent.click(screen.getByText("Toggle"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    unmount();
    await userEvent.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DropdownItem", () => {
  it("is a button that calls both handlers", async () => {
    const onClick = vi.fn();
    const onItemClick = vi.fn();
    render(
      <DropdownItem onClick={onClick} onItemClick={onItemClick} className="extra">
        Edit
      </DropdownItem>
    );
    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveClass("block", "extra");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it("works without handlers", async () => {
    render(<DropdownItem baseClassName="base">Plain</DropdownItem>);
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.getByRole("button", { name: "Plain" })).toHaveClass("base");
  });

  it("is a link when given an address", async () => {
    const onItemClick = vi.fn();
    render(
      <DropdownItem tag="a" href="/account" onItemClick={onItemClick}>
        Account
      </DropdownItem>
    );
    const link = screen.getByRole("link", { name: "Account" });
    expect(link).toHaveAttribute("href", "/account");
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(onItemClick).toHaveBeenCalled();
  });

  it("falls back to a button when a link has no address", () => {
    render(<DropdownItem tag="a">Nowhere</DropdownItem>);
    expect(screen.getByRole("button", { name: "Nowhere" })).toBeInTheDocument();
  });
});

describe("LoadError", () => {
  it("shows a default title and no retry button", () => {
    render(<LoadError />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load this");
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });

  it("uses the 'Couldn't …' part of a message as the title", () => {
    render(<LoadError message="Couldn't load the employees. Check your connection." />);
    const paragraphs = screen.getByRole("alert").querySelectorAll("p");
    expect(paragraphs[0]).toHaveTextContent("Couldn't load the employees");
    expect(paragraphs[1]).toHaveTextContent("Check your connection.");
  });

  it("shows a title alone when the message has nothing after it", () => {
    render(<LoadError message="Couldn't load the shifts." />);
    const paragraphs = screen.getByRole("alert").querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent("Couldn't load the shifts");
  });

  it("keeps a custom title for other messages and offers a retry", async () => {
    const onRetry = vi.fn();
    render(<LoadError title="Oops" message="Server down" onRetry={onRetry} className="mt-4" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("mt-4");
    expect(alert).toHaveTextContent("Oops");
    expect(alert).toHaveTextContent("Server down");
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("is translated", () => {
    setLang("fr");
    try {
      render(<LoadError onRetry={() => {}} />);
      expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    } finally {
      act(() => setLang("en"));
    }
  });
});

describe("FeedbackHost", () => {
  afterEach(() => {
    act(() => {
      getToasts().forEach((item) => dismissToast(item.id));
      for (let req = getConfirm(); req; req = getConfirm()) answerConfirm(req.id, false);
    });
  });

  it("shows nothing at first", () => {
    render(<FeedbackHost />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows a success toast as a status with its title", () => {
    render(<FeedbackHost />);
    act(() => toast.success("Planning saved", "Done"));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Done");
    expect(status).toHaveTextContent("Planning saved");
    expect(status).toHaveTextContent("✓");
  });

  it.each([
    ["error", "alert"],
    ["warning", "alert"],
    ["info", "status"],
  ] as const)("announces a %s toast as %s", (kind, role) => {
    render(<FeedbackHost />);
    act(() => toast[kind]("Something happened"));
    expect(screen.getByRole(role)).toHaveTextContent("Something happened");
  });

  it("removes a toast when it is dismissed", async () => {
    render(<FeedbackHost />);
    act(() => toast.info("Heads up"));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  });

  it("asks to confirm and resolves true on confirm", async () => {
    render(<FeedbackHost />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = confirmDialog({ title: "Save changes?", message: "They will be visible to everyone." });
    });
    const dialog = screen.getByRole("alertdialog", { name: "Save changes?" });
    expect(dialog).toHaveTextContent("They will be visible to everyone.");
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toHaveFocus();
    await userEvent.click(confirm);
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("starts a dangerous confirm on Cancel and labels it Delete", async () => {
    render(<FeedbackHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirmDialog({ title: "Delete 3 records?", danger: true });
    });
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toHaveClass("bg-error-500");
    expect(dialog.querySelector("p")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await expect(answer).resolves.toBe(false);
  });

  it("uses custom button labels", () => {
    render(<FeedbackHost />);
    act(() => {
      void confirmDialog({ title: "Leave?", confirmLabel: "Leave", cancelLabel: "Stay" });
    });
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay" })).toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    render(<FeedbackHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirmDialog({ title: "Sure?" });
    });
    await userEvent.keyboard("{Escape}");
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("ignores other keys", async () => {
    render(<FeedbackHost />);
    act(() => {
      void confirmDialog({ title: "Sure?" });
    });
    await userEvent.keyboard("a");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("cancels on a click on the backdrop", async () => {
    render(<FeedbackHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirmDialog({ title: "Sure?" });
    });
    const backdrop = screen.getByRole("alertdialog").previousElementSibling as HTMLElement;
    await userEvent.click(backdrop);
    await expect(answer).resolves.toBe(false);
  });

  it("shows queued confirms one after another", async () => {
    render(<FeedbackHost />);
    act(() => {
      void confirmDialog({ title: "First?" });
      void confirmDialog({ title: "Second?" });
    });
    expect(screen.getByRole("alertdialog", { name: "First?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alertdialog", { name: "Second?" })).toBeInTheDocument();
  });
});

describe("images", () => {
  it("shows the responsive cover image", () => {
    render(<ResponsiveImage />);
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute("src", "/images/grid-image/image-01.png");
  });

  it("shows two and three image grids", () => {
    const two = render(<TwoColumnImageGrid />);
    expect(two.container.querySelectorAll("img")).toHaveLength(2);
    two.unmount();
    const three = render(<ThreeColumnImageGrid />);
    expect(three.container.querySelectorAll("img")).toHaveLength(3);
  });
});

describe("Modal", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  function Harness(props: Partial<React.ComponentProps<typeof Modal>>) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal isOpen={open} onClose={props.onClose ?? (() => setOpen(false))} {...props}>
          <p>Modal body</p>
          <button>Inner action</button>
        </Modal>
      </>
    );
  }

  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={() => {}}>
        <p>Hidden</p>
      </Modal>
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("unset");
  });

  it("locks page scrolling while open and unlocks when closed", async () => {
    render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Modal body")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("unset");
  });

  it("unlocks page scrolling when unmounted while open", () => {
    const { unmount } = render(<Harness />);
    unmount();
    expect(document.body.style.overflow).toBe("unset");
  });

  it("closes on Escape but not on other keys", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.keyboard("a");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops listening for Escape once closed", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen onClose={onClose}>
        x
      </Modal>
    );
    rerender(
      <Modal isOpen={false} onClose={onClose}>
        x
      </Modal>
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a click on the backdrop but not inside", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} className="max-w-sm" />);
    await userEvent.click(screen.getByText("Inner action"));
    expect(onClose).not.toHaveBeenCalled();
    const content = screen.getByText("Modal body").closest(".max-w-sm") as HTMLElement;
    await userEvent.click(content.previousElementSibling as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with its close button", async () => {
    render(<Harness />);
    const buttons = screen.getAllByRole("button");
    // the close button comes first inside the dialog content
    await userEvent.click(buttons[1]);
    expect(screen.queryByText("Modal body")).not.toBeInTheDocument();
  });

  it("can hide the close button", () => {
    render(<Harness showCloseButton={false} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Open", "Inner action"]);
  });

  it("fills the screen without a backdrop when fullscreen", () => {
    const { container } = render(<Harness isFullscreen />);
    const content = screen.getByText("Modal body").parentElement!.parentElement!;
    expect(content).toHaveClass("w-full", "h-full");
    expect(container.querySelector(".backdrop-blur-\\[32px\\]")).toBeNull();
  });

  // BUG-701: the Modal's close button is an unlabelled icon, so screen readers announce just "button"
  it("gives the close button an accessible name", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  // BUG-702: the Modal is not exposed as a dialog (no role="dialog" / aria-modal)
  it("is announced as a modal dialog", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});

describe("Table", () => {
  it("builds a table with header and body cells", () => {
    render(
      <Table className="t">
        <TableHeader className="h">
          <TableRow>
            <TableCell isHeader>Name</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody className="b">
          <TableRow className="r">
            <TableCell className="c">Sara</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole("table")).toHaveClass("min-w-full", "t");
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Sara" })).toHaveClass("c");
    expect(screen.getByRole("cell", { name: "Sara" }).parentElement).toHaveClass("r");
  });
});

describe("YouTubeEmbed", () => {
  it("embeds the video at 16:9 by default", () => {
    render(<YouTubeEmbed videoId="abc123" />);
    const frame = screen.getByTitle("YouTube video");
    expect(frame).toHaveAttribute("src", "https://www.youtube.com/embed/abc123");
    expect(frame.parentElement).toHaveClass("aspect-video");
  });

  it.each([
    ["4:3", "aspect-4/3"],
    ["21:9", "aspect-21/9"],
    ["1:1", "aspect-square"],
  ] as const)("supports the %s ratio", (ratio, cls) => {
    render(<YouTubeEmbed videoId="x" aspectRatio={ratio} title="Demo" className="extra" />);
    expect(screen.getByTitle("Demo").parentElement).toHaveClass(cls, "extra");
  });

  it("shows the four example videos", () => {
    render(<VideosExample />);
    expect(screen.getAllByTitle("YouTube video")).toHaveLength(4);
    expect(screen.getByText("Video Ratio 21:9")).toBeInTheDocument();
  });
});
