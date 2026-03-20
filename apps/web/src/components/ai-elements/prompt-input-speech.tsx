import { MicIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useEffectOnDeps } from "@/hooks/use-mount-effect";
import type { ComponentProps, RefObject } from "react";
import { cn } from "@/lib/utils";
import { PromptInputButton } from "./prompt-input-primitives";

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start: () => void;
	stop: () => void;
	onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onend: ((this: SpeechRecognition, ev: Event) => void) | null;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

type SpeechRecognitionResultList = {
	readonly length: number;
	item: (index: number) => SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
	readonly length: number;
	item: (index: number) => SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
};

type SpeechRecognitionAlternative = {
	transcript: string;
	confidence: number;
};

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognition;
}

declare global {
	interface Window {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	}
}

export type PromptInputSpeechButtonProps = ComponentProps<typeof PromptInputButton> & {
	textareaRef?: RefObject<HTMLTextAreaElement | null>;
	onTranscriptionChange?: (text: string) => void;
};

export const PromptInputSpeechButton = ({
	className,
	textareaRef,
	onTranscriptionChange,
	...props
}: PromptInputSpeechButtonProps) => {
	const [isListening, setIsListening] = useState(false);
	const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
	const recognitionRef = useRef<SpeechRecognition | null>(null);

	useEffectOnDeps(() => {
		if (typeof window === "undefined") return;

		const SpeechRecognitionClass = window.SpeechRecognition ?? window.webkitSpeechRecognition;
		if (SpeechRecognitionClass) {
			const speechRecognition = new SpeechRecognitionClass();

			speechRecognition.continuous = true;
			speechRecognition.interimResults = true;
			speechRecognition.lang = "en-US";

			speechRecognition.onstart = () => {
				setIsListening(true);
			};

			speechRecognition.onend = () => {
				setIsListening(false);
			};

			speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
				let finalTranscript = "";

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const result = event.results[i];
					if (result.isFinal) {
						finalTranscript += result[0].transcript;
					}
				}

				if (finalTranscript && textareaRef?.current) {
					const textarea = textareaRef.current;
					const currentValue = textarea.value;
					const newValue = currentValue + (currentValue ? " " : "") + finalTranscript;

					textarea.value = newValue;
					textarea.dispatchEvent(new Event("input", { bubbles: true }));
					onTranscriptionChange?.(newValue);
				}
			};

			speechRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
				console.error("Speech recognition error:", event.error);
				setIsListening(false);
			};

			recognitionRef.current = speechRecognition;
			setRecognition(speechRecognition);
		}

		return () => {
			if (recognitionRef.current) {
				recognitionRef.current.stop();
			}
		};
	}, [textareaRef, onTranscriptionChange]);

	const toggleListening = useCallback(() => {
		if (!recognition) {
			return;
		}

		if (isListening) {
			recognition.stop();
		} else {
			recognition.start();
		}
	}, [recognition, isListening]);

	return (
		<PromptInputButton
			className={cn(
				"relative transition-all duration-200",
				isListening && "animate-pulse bg-accent text-accent-foreground",
				className,
			)}
			disabled={!recognition}
			onClick={toggleListening}
			{...props}
		>
			<MicIcon className="size-4" />
		</PromptInputButton>
	);
};
