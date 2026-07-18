import { Textarea as TaroTextarea, TextareaProps } from "@tarojs/components";

import { View, Text } from "@tarojs/components";

import "./ui.scss";



type Props = TextareaProps & {

  label?: string;

  hint?: string;

  error?: string;

};



export function TextArea({ label, hint, error, className, ...rest }: Props) {

  return (

    <View className="ui-field">

      {label && <Text className="ui-field__label">{label}</Text>}

      <View className="ui-field__control ui-field__control--textarea">

        <TaroTextarea className={`ui-field__textarea ${className || ""}`} {...rest} />

      </View>

      {error && <Text className="ui-field__error">{error}</Text>}

      {!error && hint && <Text className="ui-field__hint">{hint}</Text>}

    </View>

  );

}

