import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, userEvent, waitFor, within } from "@/test/render";
import CheckboxComponents from "./CheckboxComponents";
import DefaultInputs from "./DefaultInputs";
import DropzoneComponent from "./DropZone";
import FileInputExample from "./FileInputExample";
import InputGroup from "./InputGroup";
import InputStates from "./InputStates";
import RadioButtons from "./RadioButtons";
import SelectInputs from "./SelectInputs";
import TextAreaInput from "./TextAreaInput";
import ToggleSwitch from "./ToggleSwitch";

const card = (title: string) => screen.getByRole("heading", { name: title }).closest(".rounded-2xl") as HTMLElement;

describe("form element examples", () => {
  it("CheckboxComponents: toggles the enabled boxes, not the disabled one", async () => {
    render(<CheckboxComponents />);
    const [plain, checked, disabled] = screen.getAllByRole("checkbox");
    expect(plain).not.toBeChecked();
    expect(checked).toBeChecked();
    await userEvent.click(plain);
    await userEvent.click(checked);
    expect(plain).toBeChecked();
    expect(checked).not.toBeChecked();
    expect(disabled).toBeDisabled();
  });

  it("DefaultInputs: shows and hides the password and logs choices", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { container } = render(<DefaultInputs />);
    const password = screen.getByPlaceholderText("Enter your password");
    expect(password).toHaveAttribute("type", "password");
    const eye = password.parentElement!.nextElementSibling as HTMLElement;
    await userEvent.click(eye);
    expect(password).toHaveAttribute("type", "text");
    await userEvent.click(eye);
    expect(password).toHaveAttribute("type", "password");

    await userEvent.selectOptions(screen.getByRole("combobox"), "Template");
    expect(log).toHaveBeenCalledWith("Selected value:", "template");

    const time = container.querySelector("#tm") as HTMLInputElement;
    await userEvent.type(time, "09:30");
    expect(log).toHaveBeenCalledWith("09:30");

    const date = screen.getByLabelText("Date Picker Input") as HTMLInputElement & {
      _flatpickr: { setDate: (d: string, fire: boolean) => void };
    };
    date._flatpickr.setDate("2026-03-15", true);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ currentDateString: "2026-03-15" }));
  });

  it("DropZone: logs dropped images", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { container } = render(<DropzoneComponent />);
    expect(screen.getByText("Drag & Drop Files Here")).toBeInTheDocument();
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    await waitFor(() => expect(log).toHaveBeenCalledWith("Files dropped:", [expect.objectContaining({ name: "a.png" })]));
  });

  it("FileInputExample: logs the chosen file's name, and nothing when the choice is cleared", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { container } = render(<FileInputExample />);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "cv.pdf", { type: "application/pdf" }));
    expect(log).toHaveBeenCalledWith("Selected file:", "cv.pdf");
    log.mockClear();
    await userEvent.upload(input, []);
    expect(log).not.toHaveBeenCalled();
  });

  it("InputGroup: has an email field and two phone fields that log changes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<InputGroup />);
    expect(screen.getByPlaceholderText("info@gmail.com")).toBeInTheDocument();
    const [first] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(first, "AU");
    expect(log).toHaveBeenCalledWith("Updated phone number:", "+61");
    expect(screen.getAllByPlaceholderText("+1 (555) 000-0000")).toHaveLength(2);
  });

  it("InputStates: flags an invalid email and accepts a valid one", async () => {
    render(<InputStates />);
    const [errorField, successField] = screen.getAllByPlaceholderText("Enter your email");
    await userEvent.type(errorField, "nope");
    expect(screen.getByText("This is an invalid email address.")).toBeInTheDocument();
    expect(errorField).toHaveClass("border-error-500");
    await userEvent.clear(successField);
    await userEvent.type(successField, "sara@nexo.dz");
    expect(screen.getByText("Valid email!")).toBeInTheDocument();
    expect(screen.getByDisplayValue("disabled@example.com")).toBeDisabled();
  });

  it("RadioButtons: picks a radio but not the disabled one", async () => {
    render(<RadioButtons />);
    expect(screen.getByRole("radio", { name: "Selected" })).toBeChecked();
    await userEvent.click(screen.getByText("Default"));
    expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
    await userEvent.click(screen.getByText("Disabled"));
    expect(screen.getByRole("radio", { name: "Disabled" })).not.toBeChecked();
  });

  it("SelectInputs: logs the single choice and keeps the multi-select values", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<SelectInputs />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "Development");
    expect(log).toHaveBeenCalledWith("Selected value:", "development");
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 3")).toBeInTheDocument();
    const chip = screen.getByText("Option 1").parentElement!;
    await userEvent.click(within(chip).getByRole("button"));
    expect(screen.getByText(/Selected Values:/)).toHaveTextContent("Selected Values: 3");
  });

  it("TextAreaInput: types into the editable areas only", async () => {
    render(<TextAreaInput />);
    const [first, disabled, withError] = screen.getAllByRole("textbox");
    await userEvent.type(first, "Hi");
    await userEvent.type(withError, "Yo");
    expect(first).toHaveValue("Hi");
    expect(withError).toHaveValue("Yo");
    expect(disabled).toBeDisabled();
    expect(screen.getByText("Please enter a valid message.")).toBeInTheDocument();
  });

  it("ToggleSwitch: logs the new state of a switch", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<ToggleSwitch />);
    const toggle = card("Toggle switch input");
    await userEvent.click(within(toggle).getAllByText("Default")[0]);
    expect(log).toHaveBeenCalledWith("Switch is now:", "OFF");
    await userEvent.click(within(toggle).getAllByText("Default")[0]);
    expect(log).toHaveBeenCalledWith("Switch is now:", "ON");
  });
});
