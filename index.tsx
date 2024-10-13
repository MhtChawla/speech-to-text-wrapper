import React, { memo, useEffect, useRef, useState } from "react";
import type { SpeechErrorEvent, SpeechResultsEvent } from "@react-native-voice/voice";
import Voice from "@react-native-voice/voice";
import { Toast } from "react-native-toast-message/lib/src/Toast";
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import EE from "eventemitter3";

const screenH = Dimensions.get("window").height;
const screenW = Dimensions.get("window").width;

declare const process: { env: Record<string, string> };

interface SpeechRecogEvents {
    ownerChanged: { id: string }
    success: SpeechResultsEvent
    error: SpeechErrorEvent
};

const speechRecogEmitter = new EE<SpeechRecogEvents>();
let currentOwnerId: string | null = null;

Voice.onSpeechError = (err) => {
    console.log("PRE-EMIT ERROR", err);
    speechRecogEmitter.emit("error", err);
};

Voice.onSpeechResults = (result: SpeechResultsEvent) => {
    // console.log("PRE-EMIT SUCCESS", result);
    speechRecogEmitter.emit("success", result);
};

const generateUniqueId = () => `_${Math.random().toString(36).substr(2, 9)}`;

export const useSpeechRecog = (p: {
    localeCode: string
    onOwnerChange?: (id: string) => void
    onSuccess: (res: SpeechResultsEvent) => void
    onError: (res: SpeechErrorEvent) => void
}) => {
    const ownerId = useRef(generateUniqueId());
    const [listening, setListening] = useState(false);

    useEffect(() => {
        const onOwnerChange = (id: string) => {
            if (id !== ownerId.current) {
                p.onOwnerChange?.(id);
                setListening(false);
            }
        };
        const onSuccess = (res: SpeechResultsEvent) => {
            if (currentOwnerId === ownerId.current) {
                setListening(false);
                p.onSuccess(res);
            }
        };
        const onError = (err: SpeechErrorEvent) => {
            if (currentOwnerId === ownerId.current) {
                setListening(false);
                p.onError(err);
            }
            Voice.destroy();
        };
        speechRecogEmitter.on("ownerChanged", onOwnerChange);
        speechRecogEmitter.on("success", onSuccess);
        speechRecogEmitter.on("error", onError);
        return () => {
            speechRecogEmitter.off("ownerChanged", onOwnerChange);
            speechRecogEmitter.off("success", onSuccess);
            speechRecogEmitter.off("error", onError);
        };
    }, []);

    const startRecording = () => {
        currentOwnerId = ownerId.current;
        Voice.start(p.localeCode, {
            EXTRA_PARTIAL_RESULTS: true,
            EXTRA_MAX_RESULTS: 5,
            REQUEST_PERMISSIONS_AUTO: true,
        });
        setListening(true);
        speechRecogEmitter.emit("ownerChanged", ownerId.current);
    };

    const stopRecording = async () => {
        if (currentOwnerId !== ownerId.current) return;
        setListening(false);
        return Voice.destroy();
    };

    return {
        listening,
        startRecording,
        stopRecording,
    };
};

const MenuItem = ({ value, lastItem, closeModal, onSelect }: {
    closeModal: () => void
    onSelect: (v: string) => void
    value: string
    lastItem: boolean
}) => (
    <>
        <TouchableOpacity
            onPress={() => {
                onSelect(value);
                closeModal();
            }}
            style={{
                padding: 8,
                paddingHorizontal: 10,
            }}
        >
            <Text style={style.menuitemText}>{value}</Text>
        </TouchableOpacity>
        {!lastItem && <View style={{ borderBottomWidth: 0.2 }} />}
    </>
);

const TooltipMenu = ({ menu = ["0", "1", "2"], visible, closeModal, onSelect }: {
    menu: string[] | undefined
    visible: boolean
    closeModal: () => void
    onSelect: (v: string) => void
}) => (
    visible
        ? (
            <View style={style.tooltip}>
                <View style={style.triangle} />
                <View style={style.box}>
                    {menu.map((item, index) => (
                        <MenuItem
                            onSelect={onSelect}
                            closeModal={closeModal}
                            value={item}
                            key={index.toString()}
                            lastItem={index + 1 === menu.length}
                        />
                    ))}
                </View>
            </View>
        )
        : null
);

const SpeechtoTextWrapper = (p: {
    children: React.ReactElement
    locale?: string
}) => {
    const [visible, setVisible] = useState(false);
    const [partialResults, setPartialResults] = useState<string[] | undefined>([]);
    // auto-stop
    const silenceTimer = useRef<ReturnType<typeof setTimeout>>();

    const currentLocale = p.locale ?? "en-US";

    const speechRecog = useSpeechRecog({
        localeCode: currentLocale,
        onError(err) {
            console.error("speech recognition error", err);
            Toast.show({
                type: "error",
                text1: "Sorry! We could not make sense of that.",
                position: "bottom",
            });
        },
        onSuccess(result) {
            if (result?.value?.length) {
                child.props.onChangeText(result?.value[0]);
                if (result?.value?.length > 1) {
                    setPartialResults(result?.value);
                    setVisible(true);
                } else {
                    resetTooltipMenu();
                }
            }
            silenceTimer.current = setTimeout(async () => {
                speechRecog.stopRecording();
            }, 1000);
            clearTimeout(silenceTimer.current);
        },
    });

    const child = React.Children.only(p.children);

    const resetTooltipMenu = () => {
        setPartialResults([]);
        setVisible(false);
    };

    useEffect(() => {
        resetTooltipMenu();
    }, [child.props.value]);

    return (
        <>
            {visible && (
                <TouchableWithoutFeedback onPress={resetTooltipMenu}>
                    <View
                        style={[style.overlay]}
                    />
                </TouchableWithoutFeedback>
            )}

            <View style={{ justifyContent: "center" }}>
                {React.cloneElement(child, {
                    style: [child.props.style, { paddingRight: 40 }],
                })}

                <TooltipMenu
                    visible={visible}
                    onSelect={v => child.props.onChangeText(v)}
                    menu={partialResults}
                    closeModal={resetTooltipMenu}
                />

                <TouchableOpacity
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                        position: "absolute",
                        right: 10,
                    }}
                    onPress={speechRecog.listening ? speechRecog.stopRecording : speechRecog.startRecording}
                >
                    <Image
                        key={speechRecog.listening.toString()}
                        style={{
                            width: 24,
                            height: 24,
                        }}
                        source={{ uri: speechRecog.listening ? "https://icons.iconarchive.com/icons/icons8/windows-8/512/Music-Audio-Wave-icon.png" : "https://www.iconpacks.net/icons/1/free-microphone-icon-342-thumb.png" }}
                    />
                </TouchableOpacity>
            </View>
        </>
    );
};

export default memo(SpeechtoTextWrapper);

const style = StyleSheet.create({
    tooltip: {
        position: "absolute",
        zIndex: 100,
        left: 140,
        top: 42,
    },
    triangle: {
        width: 10,
        height: 15,
        marginLeft: 10,
        borderTopWidth: 0,
        borderBottomWidth: 10,
        borderLeftWidth: 5,
        borderRightWidth: 7,
        backgroundColor: "transparent",
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "white",
        elevation: 25,
        zIndex: 2,
    },
    box: {
        width: 150,
        backgroundColor: "white",
        borderRadius: 6,
        paddingVertical: 5,
        elevation: 5,
        zIndex: 2,
    },
    menuitemText: {
        fontSize: 14,
        color: "black",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        width: screenW * 3,
        height: screenH * 3,
        zIndex: 5,
        position: "absolute",
        top: -screenH,
        left: -screenW,
    },
});
