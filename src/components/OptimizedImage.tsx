import React from 'react';
import {
  getTransformedImage,
  type ImageTransformPreset,
  type VenueImageKey,
} from '../lib/imageTransform';

interface OptimizedImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  imageKey: VenueImageKey;
  preset?: ImageTransformPreset;
  sizes?: string;
}

export const OptimizedImage = React.forwardRef<HTMLImageElement, OptimizedImageProps>(
  (
    {
      imageKey,
      preset = 'card',
      sizes,
      alt = '',
      decoding = 'async',
      referrerPolicy = 'no-referrer',
      className,
      ...rest
    },
    ref
  ) => {
    const transformed = getTransformedImage(imageKey, preset);

    return (
      <picture className="contents">
        <source
          type="image/webp"
          srcSet={transformed.webpSrcSet}
          sizes={sizes}
        />
        <img
          ref={ref}
          src={transformed.src}
          alt={alt}
          decoding={decoding}
          referrerPolicy={referrerPolicy}
          className={className}
          {...rest}
        />
      </picture>
    );
  }
);

OptimizedImage.displayName = 'OptimizedImage';
