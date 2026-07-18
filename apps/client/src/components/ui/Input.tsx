import { Input as TaroInput, InputProps } from "@tarojs/components";

import { View, Text } from "@tarojs/components";

import "./ui.scss";



type Props = InputProps & {

  label?: string;

  hint?: string;

  error?: string;

};



export function Input({ label, hint, error, className, ...rest }: Props) {

  return (

    <View className="ui-field">

      {label && <Text className="ui-field__label">{label}</Text>}

      <View className="ui-field__control">

        <TaroInput className={`ui-field__input ${className || ""}`} {...rest} />

      </View>

      {error && <Text className="ui-field__error">{error}</Text>}

      {!error && hint && <Text className="ui-field__hint">{hint}</Text>}

    </View>

  );

}

